import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import { ForbiddenError } from "@/shared/lib/errors";

vi.mock("@/features/admin/repositories/organization.repository", () => ({
  OrganizationRepository: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { OrganizationRepository } from "@/features/admin/repositories/organization.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { OrganizationService } from "./organization.service";

const repo = vi.mocked(OrganizationRepository);
const audit = vi.mocked(AuditLogService);
const admin: Actor = { userId: "a", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m", orgRole: "MEMBER", organizationId: "org-1" };

const orgRow = {
  id: "org-1",
  name: "Consint",
  domain: "consint.ai",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.resetAllMocks();
  repo.findById.mockResolvedValue(orgRow as never);
});

it("getSettings requires MANAGE_ORGANIZATION", async () => {
  await expect(OrganizationService.getSettings(member)).rejects.toBeInstanceOf(ForbiddenError);
});

it("getSettings reads the actor's own org (F-1)", async () => {
  const dto = await OrganizationService.getSettings(admin);
  expect(repo.findById).toHaveBeenCalledWith("org-1");
  expect(dto).toMatchObject({ id: "org-1", name: "Consint" });
});

it("updateSettings writes a before/after audit entry", async () => {
  repo.update.mockResolvedValue({ ...orgRow, name: "Consint AI", updatedAt: new Date() } as never);
  const dto = await OrganizationService.updateSettings(admin, { name: "Consint AI" });
  expect(dto.name).toBe("Consint AI");
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "ORG_SETTINGS_CHANGED",
      beforeData: { name: "Consint", domain: "consint.ai" },
      afterData: expect.objectContaining({ name: "Consint AI" }),
    }),
  );
});

it("updateSettings requires MANAGE_ORGANIZATION", async () => {
  await expect(
    OrganizationService.updateSettings(member, { name: "x" }),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
