import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";

// Exhaustive RBAC matrix for the Issues module — the acceptance criterion in
// docs/02_Modules/15_roles.md: "automated test per role/action pair before a
// module is considered done." Repository + sibling services are mocked; this
// asserts the service layer's allow/deny decision for every (role × action).

vi.mock("@/features/issues/repositories/issue.repository", () => ({
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  IssueRepository: {
    listByProject: vi.fn(),
    countByStatus: vi.fn(),
    findDetail: vi.fn(),
    findEpic: vi.fn(),
    createWithKey: vi.fn(),
    updateWithVersion: vi.fn(),
    setStatusWithVersion: vi.fn(),
    findRankInColumn: vi.fn(),
    findRankInBacklog: vi.fn(),
    reorderWithVersion: vi.fn(),
    softDelete: vi.fn(),
  },
}));
// Issue creation now consults custom fields for required-field enforcement
// (ADR-0042 §4). Plain async stubs rather than `vi.fn().mockResolvedValue()`:
// these suites call `vi.resetAllMocks()` in beforeEach, which strips a mock's
// implementation and would leave `missingRequired` returning undefined.
vi.mock("@/features/custom-fields/services/custom-field.service", () => ({
  CustomFieldService: {
    missingRequired: async () => [],
    setForIssue: async () => [],
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));
// Best-effort personalization signal (ADR-0012); stub so the RBAC matrix stays
// a pure service-layer unit test with no recent-items DB dependency.
vi.mock("@/features/home/services/recent-item.service", () => ({
  RecentItemService: { record: vi.fn() },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { issueAssigned: vi.fn(), issueStatusChanged: vi.fn(), issueCommented: vi.fn() },
}));

import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "./issue.service";
import { ForbiddenError } from "@/shared/lib/errors";

const repo = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);

const ACTIVE_CTX = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
};

// The issue under test is reported by, and assigned to, SOMEONE ELSE — so the
// reporter/assignee delete exception never masks a role's base permission.
function otherRow() {
  return {
    id: "issue-1",
    projectId: "proj-1",
    key: "ENG-1",
    type: "TASK",
    title: "Someone else's issue",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: "other-user",
    reporterId: "other-user",
    sprintId: null,
    epicId: null,
    storyPoints: null,
    rank: "a0",
    version: 0,
    dueDate: null,
    createdAt: new Date("2026-07-14T00:00:00Z"),
    updatedAt: new Date("2026-07-14T00:00:00Z"),
    createdBy: "other-user",
    updatedBy: null,
    deletedAt: null,
    assignee: { id: "other-user", name: "Other", avatarUrl: null },
    reporter: { id: "other-user", name: "Other", avatarUrl: null },
  };
}

// Wire the mocks so any action can run; the role is injected per case.
function arrange(role: ProjectRoleDto | null) {
  projects.getContext.mockResolvedValue(ACTIVE_CTX);
  projects.getMemberRole.mockResolvedValue(role);
  repo.findDetail.mockResolvedValue(otherRow() as never);
  repo.listByProject.mockResolvedValue([] as never);
  repo.countByStatus.mockResolvedValue([] as never);
  repo.createWithKey.mockResolvedValue(otherRow() as never);
  repo.updateWithVersion.mockResolvedValue(otherRow() as never);
  repo.setStatusWithVersion.mockResolvedValue(
    { ...otherRow(), status: "IN_PROGRESS" } as never,
  );
  repo.softDelete.mockResolvedValue(otherRow() as never);
}

type ActionName = "get" | "list" | "create" | "update" | "transition" | "delete";

const ACTIONS: Record<ActionName, (actor: Actor) => Promise<unknown>> = {
  get: (a) => IssueService.get(a, "issue-1"),
  list: (a) => IssueService.list(a, "proj-1"),
  create: (a) =>
    IssueService.create(a, "proj-1", { type: "TASK", title: "x", priority: "MEDIUM" }),
  update: (a) => IssueService.update(a, "issue-1", { title: "y", expectedVersion: 0 }),
  transition: (a) => IssueService.transition(a, "issue-1", "IN_PROGRESS", 0),
  delete: (a) => IssueService.delete(a, "issue-1"),
};

// Expected outcome per (role × action). "allow" = resolves; "deny" = Forbidden.
// Roles: VIEWER, MEMBER, LEAD, non-member (null), and an org ADMIN who holds
// no project role — since ADR-0024 an org ADMIN is an effective LEAD everywhere.
type Outcome = "allow" | "deny";
const MATRIX: {
  label: string;
  role: ProjectRoleDto | null;
  orgRole: Actor["orgRole"];
  expect: Record<ActionName, Outcome>;
}[] = [
  {
    label: "VIEWER",
    role: "VIEWER",
    orgRole: "MEMBER",
    expect: { get: "allow", list: "allow", create: "deny", update: "deny", transition: "deny", delete: "deny" },
  },
  {
    label: "MEMBER (not reporter/assignee)",
    role: "MEMBER",
    orgRole: "MEMBER",
    expect: { get: "allow", list: "allow", create: "allow", update: "allow", transition: "allow", delete: "deny" },
  },
  {
    label: "LEAD",
    role: "LEAD",
    orgRole: "MEMBER",
    expect: { get: "allow", list: "allow", create: "allow", update: "allow", transition: "allow", delete: "allow" },
  },
  {
    label: "non-member",
    role: null,
    orgRole: "MEMBER",
    expect: { get: "allow", list: "allow", create: "deny", update: "deny", transition: "deny", delete: "deny" },
  },
  {
    // ADR-0024: an org ADMIN is an effective LEAD on every project in its org,
    // even with no ProjectMember row — so it can do everything a LEAD can.
    label: "org ADMIN without a project role (effective LEAD, ADR-0024)",
    role: null,
    orgRole: "ADMIN",
    expect: { get: "allow", list: "allow", create: "allow", update: "allow", transition: "allow", delete: "allow" },
  },
];

describe("Issues RBAC matrix (15_roles.md)", () => {
  beforeEach(() => vi.resetAllMocks());

  for (const row of MATRIX) {
    const actor: Actor = { userId: "acting-user", orgRole: row.orgRole, organizationId: "org-1" };
    describe(row.label, () => {
      for (const action of Object.keys(ACTIONS) as ActionName[]) {
        const expected = row.expect[action];
        it(`${action} → ${expected}`, async () => {
          arrange(row.role);
          if (expected === "allow") {
            await expect(ACTIONS[action](actor)).resolves.not.toThrow();
          } else {
            await expect(ACTIONS[action](actor)).rejects.toBeInstanceOf(ForbiddenError);
          }
        });
      }
    });
  }

  // The reporter/assignee delete exception (BR-2): a MEMBER may delete an
  // issue they report or are assigned to, but not others'.
  describe("delete reporter/assignee exception (BR-2)", () => {
    beforeEach(() => vi.resetAllMocks());

    it("MEMBER who is the reporter → allow", async () => {
      projects.getContext.mockResolvedValue(ACTIVE_CTX);
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue({ ...otherRow(), reporterId: "acting-user" } as never);
      repo.softDelete.mockResolvedValue(otherRow() as never);
      await expect(
        IssueService.delete({ userId: "acting-user", orgRole: "MEMBER", organizationId: "org-1" }, "issue-1"),
      ).resolves.not.toThrow();
    });

    it("MEMBER who is the assignee → allow", async () => {
      projects.getContext.mockResolvedValue(ACTIVE_CTX);
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue({ ...otherRow(), assigneeId: "acting-user" } as never);
      repo.softDelete.mockResolvedValue(otherRow() as never);
      await expect(
        IssueService.delete({ userId: "acting-user", orgRole: "MEMBER", organizationId: "org-1" }, "issue-1"),
      ).resolves.not.toThrow();
    });
  });
});
