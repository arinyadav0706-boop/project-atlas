import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import { ForbiddenError, NotFoundError } from "@/shared/lib/errors";

vi.mock("@/features/admin/repositories/feature-flag.repository", () => ({
  FeatureFlagRepository: {
    listOverrides: vi.fn(),
    findOverride: vi.fn(),
    upsertOverride: vi.fn(),
    deleteOverride: vi.fn(),
  },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { FeatureFlagRepository } from "@/features/admin/repositories/feature-flag.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { FeatureFlagService } from "./feature-flag.service";

const repo = vi.mocked(FeatureFlagRepository);
const audit = vi.mocked(AuditLogService);
const admin: Actor = { userId: "a", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.resetAllMocks();
  repo.listOverrides.mockResolvedValue([]);
});

it("isEnabled returns the registry default when there is no override", async () => {
  // platform.commandPalette defaults ON; search.fuzzyMatching defaults OFF.
  expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(true);
  expect(await FeatureFlagService.isEnabled(admin, "search.fuzzyMatching")).toBe(false);
});

it("isEnabled falls back to registry defaults if the store lookup throws (GL-4 safety)", async () => {
  repo.listOverrides.mockRejectedValue(new Error('relation "feature_flags" does not exist'));
  // Must not throw — the app layout depends on this never crashing the page.
  expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(true);
  expect(await FeatureFlagService.isEnabled(admin, "search.fuzzyMatching")).toBe(false);
});

it("listForAdmin falls back to defaults if the store lookup throws", async () => {
  repo.listOverrides.mockRejectedValue(new Error("db down"));
  const flags = await FeatureFlagService.listForAdmin(admin);
  expect(flags.find((f) => f.key === "platform.commandPalette")).toMatchObject({
    enabled: true,
    isOverridden: false,
  });
});

it("isEnabled honors an explicit override over the default", async () => {
  repo.listOverrides.mockResolvedValue([
    { key: "platform.commandPalette", enabled: false, updatedAt: new Date() },
  ]);
  expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(false);
});

it("listForAdmin requires MANAGE_FEATURE_FLAGS", async () => {
  await expect(FeatureFlagService.listForAdmin(member)).rejects.toBeInstanceOf(ForbiddenError);
});

it("listForAdmin merges registry + overrides and flags isOverridden", async () => {
  repo.listOverrides.mockResolvedValue([
    { key: "search.fuzzyMatching", enabled: true, updatedAt: new Date("2026-07-23") },
  ]);
  const flags = await FeatureFlagService.listForAdmin(admin);
  const fuzzy = flags.find((f) => f.key === "search.fuzzyMatching")!;
  const palette = flags.find((f) => f.key === "platform.commandPalette")!;
  expect(fuzzy).toMatchObject({ enabled: true, isOverridden: true });
  expect(palette).toMatchObject({ enabled: true, isOverridden: false });
});

it("setOverride rejects an unknown flag key with NotFound", async () => {
  await expect(
    FeatureFlagService.setOverride(admin, "does.not.exist", { enabled: true }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

it("setOverride(enabled) upserts and writes an audit entry", async () => {
  repo.findOverride.mockResolvedValue(null);
  repo.upsertOverride.mockResolvedValue({
    key: "search.fuzzyMatching",
    enabled: true,
    updatedAt: new Date(),
  });
  const result = await FeatureFlagService.setOverride(admin, "search.fuzzyMatching", {
    enabled: true,
  });
  expect(result).toMatchObject({ enabled: true, isOverridden: true });
  expect(repo.upsertOverride).toHaveBeenCalledOnce();
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "FEATURE_FLAG_CHANGED", entityId: "search.fuzzyMatching" }),
  );
});

it("setOverride(reset) deletes the override and returns the default", async () => {
  repo.findOverride.mockResolvedValue({
    key: "platform.commandPalette",
    enabled: false,
    updatedAt: new Date(),
  });
  const result = await FeatureFlagService.setOverride(admin, "platform.commandPalette", {
    reset: true,
  });
  expect(repo.deleteOverride).toHaveBeenCalledWith("org-1", "platform.commandPalette");
  expect(result).toMatchObject({ enabled: true, isOverridden: false, updatedAt: null });
  expect(audit.record).toHaveBeenCalledOnce();
});

it("setOverride requires MANAGE_FEATURE_FLAGS", async () => {
  await expect(
    FeatureFlagService.setOverride(member, "platform.commandPalette", { enabled: false }),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
