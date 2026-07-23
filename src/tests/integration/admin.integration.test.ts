import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { OrganizationService } from "@/features/admin/services/organization.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves the admin control plane end to end
// (13_admin.md, ADR-0022/0023): capability gating, feature-flag overrides +
// evaluation + reset + org isolation, audited org settings, and the audit read.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const adminUser = await prisma.user.create({
    data: { organizationId: org.id, email: `admin-${tag}@x.com`, name: "Admin", orgRole: "ADMIN" },
  });
  const memberUser = await prisma.user.create({
    data: { organizationId: org.id, email: `member-${tag}@x.com`, name: "Member", orgRole: "MEMBER" },
  });
  const admin: Actor = { userId: adminUser.id, orgRole: "ADMIN", organizationId: org.id };
  const member: Actor = { userId: memberUser.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, admin, member };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Admin control plane integration", () => {
  it("a feature-flag override persists, is evaluated, and resets to default", async () => {
    const { admin } = await seed("ff");

    // Default first (no row): platform.commandPalette defaults ON.
    expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(true);

    await FeatureFlagService.setOverride(admin, "platform.commandPalette", { enabled: false });
    expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(false);

    // The admin catalog reflects the override.
    const flags = await FeatureFlagService.listForAdmin(admin);
    expect(flags.find((f) => f.key === "platform.commandPalette")).toMatchObject({
      enabled: false,
      isOverridden: true,
    });

    // Reset removes the row → back to default.
    await FeatureFlagService.setOverride(admin, "platform.commandPalette", { reset: true });
    expect(await FeatureFlagService.isEnabled(admin, "platform.commandPalette")).toBe(true);
    const rows = await prisma.featureFlag.count();
    expect(rows).toBe(0);
  });

  it("flag overrides are isolated per org (F-1)", async () => {
    const a = await seed("orga");
    const b = await seed("orgb");
    await FeatureFlagService.setOverride(a.admin, "search.fuzzyMatching", { enabled: true });

    expect(await FeatureFlagService.isEnabled(a.admin, "search.fuzzyMatching")).toBe(true);
    // Org B still sees the registry default (off).
    expect(await FeatureFlagService.isEnabled(b.admin, "search.fuzzyMatching")).toBe(false);
  });

  it("rejects a non-admin from managing flags and rejects unknown keys", async () => {
    const { admin, member } = await seed("guard");
    await expect(
      FeatureFlagService.setOverride(member, "platform.commandPalette", { enabled: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      FeatureFlagService.setOverride(admin, "nope.nope", { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updating org settings writes a before/after audit entry, readable via list", async () => {
    const { org, admin } = await seed("orgset");
    await OrganizationService.updateSettings(admin, { name: "Renamed Org" });

    const page = await AuditLogService.list(admin, {
      page: 1,
      pageSize: 25,
      action: "ORG_SETTINGS_CHANGED",
    });
    expect(page.pagination.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      action: "ORG_SETTINGS_CHANGED",
      entityType: "Organization",
      entityId: org.id,
    });
    expect(page.data[0]?.afterData).toMatchObject({ name: "Renamed Org" });
  });

  it("audit list is org-scoped, filterable, and paginated", async () => {
    const a = await seed("auda");
    const b = await seed("audb");
    // Two flag changes in org A, one org-settings change in B.
    await FeatureFlagService.setOverride(a.admin, "platform.commandPalette", { enabled: false });
    await FeatureFlagService.setOverride(a.admin, "search.fuzzyMatching", { enabled: true });
    await OrganizationService.updateSettings(b.admin, { name: "B2" });

    const aAll = await AuditLogService.list(a.admin, { page: 1, pageSize: 25 });
    expect(aAll.pagination.total).toBe(2); // only org A's entries
    expect(aAll.data.every((e) => e.action === "FEATURE_FLAG_CHANGED")).toBe(true);

    // Pagination: 1 per page → 2 pages.
    const p1 = await AuditLogService.list(a.admin, { page: 1, pageSize: 1 });
    const p2 = await AuditLogService.list(a.admin, { page: 2, pageSize: 1 });
    expect(p1.data).toHaveLength(1);
    expect(p2.data).toHaveLength(1);
    expect(p1.data[0]?.id).not.toBe(p2.data[0]?.id);

    // Filter by action in org A returns only the flag changes.
    const filtered = await AuditLogService.list(a.admin, {
      page: 1,
      pageSize: 25,
      entityType: "FeatureFlag",
    });
    expect(filtered.pagination.total).toBe(2);
  });

  it("a non-admin cannot read the audit log or org settings", async () => {
    const { member } = await seed("noread");
    await expect(
      AuditLogService.list(member, { page: 1, pageSize: 25 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(OrganizationService.getSettings(member)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
