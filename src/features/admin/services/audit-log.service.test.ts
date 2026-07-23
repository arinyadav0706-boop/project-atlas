import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import { ForbiddenError } from "@/shared/lib/errors";

vi.mock("@/features/admin/repositories/audit-log.repository", () => ({
  AuditLogRepository: { create: vi.fn(), list: vi.fn() },
}));

import { AuditLogRepository } from "@/features/admin/repositories/audit-log.repository";
import { AuditLogService } from "./audit-log.service";

const repo = vi.mocked(AuditLogRepository);
const admin: Actor = { userId: "a", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => vi.resetAllMocks());

it("list requires VIEW_AUDIT_LOG", async () => {
  await expect(
    AuditLogService.list(member, { page: 1, pageSize: 25 }),
  ).rejects.toBeInstanceOf(ForbiddenError);
});

it("list scopes to the org, maps rows, and returns pagination", async () => {
  repo.list.mockResolvedValue({
    rows: [
      {
        id: "al-1",
        actorId: "a",
        action: "ORG_SETTINGS_CHANGED",
        entityType: "Organization",
        entityId: "org-1",
        beforeData: { name: "x" },
        afterData: { name: "y" },
        createdAt: new Date("2026-07-23T00:00:00Z"),
      },
    ],
    total: 42,
  } as never);

  const result = await AuditLogService.list(admin, { page: 2, pageSize: 25 });
  expect(repo.list).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: "org-1", skip: 25, take: 25 }),
  );
  expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 42 });
  expect(result.data[0]).toMatchObject({ action: "ORG_SETTINGS_CHANGED", afterData: { name: "y" } });
});
