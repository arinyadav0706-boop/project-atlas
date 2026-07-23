import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

// Service-layer unit tests per docs/02_Modules/03_projects.md acceptance
// criteria — repository and audit log are mocked (Coding Standards §8).
vi.mock("@/features/projects/repositories/project.repository", () => ({
  ProjectRepository: {
    findUserByEmail: vi.fn(),
    listActiveWithMembership: vi.fn(),
    findById: vi.fn(),
    findByKey: vi.fn(),
    createWithLead: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    listMembers: vi.fn(),
    findMember: vi.fn(),
    findMemberById: vi.fn(),
    findMemberIncludingRemoved: vi.fn(),
    addMember: vi.fn(),
    restoreMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    countLeads: vi.fn(),
  },
}));

vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(ProjectRepository);
const audit = vi.mocked(AuditLogService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const orgAdminActor: Actor = { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" };

const baseProject = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  description: null,
  status: "ACTIVE" as const,
  issueKeyCounter: 0,
  createdAt: new Date("2026-07-13T00:00:00Z"),
  updatedAt: new Date("2026-07-13T00:00:00Z"),
  createdBy: "user-1",
  updatedBy: null,
  deletedAt: null,
};

const leadMembership = {
  id: "member-1",
  projectId: "proj-1",
  userId: "user-1",
  role: "LEAD" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "user-1",
  updatedBy: null,
  deletedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ProjectService.create", () => {
  it("creates the project with the creator as LEAD (BR-1)", async () => {
    repo.findByKey.mockResolvedValue(null);
    repo.createWithLead.mockResolvedValue(baseProject);

    const result = await ProjectService.create(actor, {
      key: "ENG",
      name: "Engineering",
    });

    expect(repo.createWithLead).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: "user-1", key: "ENG" }),
    );
    expect(result.myRole).toBe("LEAD");
  });

  it("rejects a duplicate key with a conflict (BR-2)", async () => {
    repo.findByKey.mockResolvedValue(baseProject);

    await expect(
      ProjectService.create(actor, { key: "ENG", name: "Another" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("RBAC — org ADMIN is an effective project LEAD (ADR-0024)", () => {
  it("allows a project update from an org ADMIN who is not a project member", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(null); // no membership row…
    repo.update.mockResolvedValue({ ...baseProject, name: "Renamed" });

    // …but elevated to LEAD, so the update succeeds (ADR-0024).
    const result = await ProjectService.update(orgAdminActor, "proj-1", { name: "Renamed" });
    expect(result.name).toBe("Renamed");
  });

  it("rejects an update from a plain MEMBER of the project", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue({ ...leadMembership, role: "MEMBER" });

    await expect(
      ProjectService.update(actor, "proj-1", { name: "Renamed" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("last-LEAD protection (BR-3)", () => {
  it("rejects demoting the only LEAD", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.findMemberById.mockResolvedValue(leadMembership);
    repo.countLeads.mockResolvedValue(1);

    await expect(
      ProjectService.changeMemberRole(actor, "proj-1", "member-1", {
        role: "MEMBER",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects removing the only LEAD", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.findMemberById.mockResolvedValue(leadMembership);
    repo.countLeads.mockResolvedValue(1);

    await expect(
      ProjectService.removeMember(actor, "proj-1", "member-1"),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows demoting a LEAD when another LEAD remains, and audit-logs it", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.findMemberById.mockResolvedValue(leadMembership);
    repo.countLeads.mockResolvedValue(2);
    repo.updateMemberRole.mockResolvedValue({ ...leadMembership, role: "MEMBER" });

    await ProjectService.changeMemberRole(actor, "proj-1", "member-1", {
      role: "MEMBER",
    });

    expect(repo.updateMemberRole).toHaveBeenCalledWith("member-1", "MEMBER", "user-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ROLE_CHANGED" }),
    );
  });
});

describe("archived projects are read-only for membership (BR-4)", () => {
  it("rejects adding a member to an ARCHIVED project", async () => {
    repo.findById.mockResolvedValue({ ...baseProject, status: "ARCHIVED" });
    repo.findMember.mockResolvedValue(leadMembership);

    await expect(
      ProjectService.addMember(actor, "proj-1", {
        email: "new@consint.ai",
        role: "MEMBER",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("adding members by email (BR-6, spec change 2026-07-13)", () => {
  it("rejects an email that matches no active user", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.findUserByEmail.mockResolvedValue(null);

    await expect(
      ProjectService.addMember(actor, "proj-1", {
        email: "ghost@consint.ai",
        role: "MEMBER",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("restores a previously removed member instead of inserting a duplicate", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.findUserByEmail.mockResolvedValue({
      id: "user-2",
      isActive: true,
      deletedAt: null,
    });
    const removedRow = {
      ...leadMembership,
      id: "member-2",
      userId: "user-2",
      role: "MEMBER" as const,
      deletedAt: new Date(),
    };
    repo.findMemberIncludingRemoved.mockResolvedValue(removedRow);
    repo.restoreMember.mockResolvedValue({ ...removedRow, deletedAt: null });
    repo.listMembers.mockResolvedValue([
      {
        ...removedRow,
        deletedAt: null,
        user: {
          id: "user-2",
          name: "Rejoined User",
          email: "rejoined@consint.ai",
          avatarUrl: null,
        },
      },
    ]);

    const member = await ProjectService.addMember(actor, "proj-1", {
      email: "rejoined@consint.ai",
      role: "MEMBER",
    });

    expect(repo.restoreMember).toHaveBeenCalledWith("member-2", "MEMBER", "user-1");
    expect(repo.addMember).not.toHaveBeenCalled();
    expect(member.name).toBe("Rejoined User");
  });
});

describe("ProjectService.delete", () => {
  it("soft-deletes and writes an audit entry (BR-5, Security §5)", async () => {
    repo.findById.mockResolvedValue(baseProject);
    repo.findMember.mockResolvedValue(leadMembership);
    repo.softDelete.mockResolvedValue({ ...baseProject, deletedAt: new Date() });

    await ProjectService.delete(actor, "proj-1");

    expect(repo.softDelete).toHaveBeenCalledWith("proj-1", "user-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROJECT_DELETED", entityId: "proj-1" }),
    );
  });
});
