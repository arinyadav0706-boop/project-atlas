import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/dependencies/repositories/dependency.repository", () => ({
  DependencyRepository: {
    listForIssue: vi.fn(),
    findById: vi.fn(),
    countForIssue: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    openBlockersOf: vi.fn(),
    newlyUnblockedTargets: vi.fn(),
    findBlockingPath: vi.fn(),
    findByKey: vi.fn(),
    keysByIds: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectId: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/saved-views/repositories/saved-view.repository", () => ({
  SavedViewRepository: { memberProjectIds: vi.fn(), allProjectIds: vi.fn() },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { issueUnblocked: vi.fn() },
}));

import { DependencyRepository } from "@/features/dependencies/repositories/dependency.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { SavedViewRepository } from "@/features/saved-views/repositories/saved-view.repository";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { DependencyService } from "./dependency.service";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/lib/errors";
import { MAX_LINKS_PER_ISSUE } from "@/features/dependencies/validation/dependency.schemas";

// Issue dependencies (docs/02_Modules/27_dependencies.md, ADR-0046).

const repo = vi.mocked(DependencyRepository);
const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);
const views = vi.mocked(SavedViewRepository);
const notifications = vi.mocked(NotificationService);

const actor: Actor = { userId: "u1", orgRole: "MEMBER", organizationId: "org-1" };

const ctx = (id = "proj-1") => ({
  id,
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
});

function endpoint(over: Record<string, unknown> = {}) {
  return {
    id: "b",
    key: "ENG-2",
    title: "The blocker",
    type: "TASK",
    status: "TODO",
    priority: "MEDIUM",
    projectId: "proj-1",
    deletedAt: null,
    project: { key: "ENG" },
    assignee: null,
    ...over,
  };
}

function linkRow(over: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    type: "BLOCKS",
    sourceId: "b",
    targetId: "a",
    source: endpoint(),
    target: endpoint({ id: "a", key: "ENG-1", title: "The blocked one" }),
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockImplementation(async (id: string) => ctx(id) as never);
  projects.getMemberRole.mockResolvedValue("MEMBER" as never);
  views.memberProjectIds.mockResolvedValue([{ projectId: "proj-1" }] as never);
  views.allProjectIds.mockResolvedValue([{ id: "proj-1" }] as never);
  issues.findProjectId.mockResolvedValue({ id: "a", projectId: "proj-1" } as never);
  repo.listForIssue.mockResolvedValue([] as never);
  repo.countForIssue.mockResolvedValue(0 as never);
  repo.findBlockingPath.mockResolvedValue({ found: false, path: null } as never);
});

// BR-1/BR-2 — one row, two readings.
describe("a stored row reads differently from each end", () => {
  it("shows as 'Blocked by' on the target and 'Blocks' on the source", async () => {
    repo.listForIssue.mockResolvedValue([linkRow()] as never);

    const fromTarget = await DependencyService.list(actor, "a");
    expect(fromTarget.links[0]).toMatchObject({ relation: "IS_BLOCKED_BY", blocking: true });

    issues.findProjectId.mockResolvedValue({ id: "b", projectId: "proj-1" } as never);
    const fromSource = await DependencyService.list(actor, "b");
    expect(fromSource.links[0]).toMatchObject({ relation: "BLOCKS" });
  });

  it("is symmetric for RELATES_TO, whichever end you stand on", async () => {
    repo.listForIssue.mockResolvedValue([linkRow({ type: "RELATES_TO" })] as never);
    const seen = await DependencyService.list(actor, "a");
    expect(seen.links[0]!.relation).toBe("RELATES_TO");
  });

  it("does not call a finished blocker 'blocking'", async () => {
    repo.listForIssue.mockResolvedValue([
      linkRow({ source: endpoint({ status: "DONE" }) }),
    ] as never);
    const seen = await DependencyService.list(actor, "a");
    expect(seen.links[0]!.blocking).toBe(false);
    expect(seen.openBlockerKeys).toEqual([]);
  });
});

// BR-6 — the honest answer for a link you may not follow.
describe("a link into a project the viewer cannot see", () => {
  beforeEach(() => {
    views.memberProjectIds.mockResolvedValue([{ projectId: "proj-1" }] as never);
    repo.listForIssue.mockResolvedValue([
      linkRow({ source: endpoint({ projectId: "secret-proj", key: "SEC-9", title: "Hush" }) }),
    ] as never);
  });

  it("shows the link but not the issue", async () => {
    const seen = await DependencyService.list(actor, "a");
    expect(seen.links).toHaveLength(1);
    expect(seen.links[0]!.issue).toEqual({ restricted: true, id: null, key: null });
  });

  it("still counts it as a blocker — it blocks you whether or not you may read it", async () => {
    const seen = await DependencyService.list(actor, "a");
    expect(seen.links[0]!.blocking).toBe(true);
    expect(seen.openBlockerKeys).toEqual(["a restricted issue"]);
  });
});

// BR-3/BR-4 — one fact, one row.
describe("creating a link", () => {
  beforeEach(() => {
    repo.findByKey.mockResolvedValue({ id: "b", key: "ENG-2", projectId: "proj-1" } as never);
    repo.create.mockResolvedValue(linkRow() as never);
  });

  it("stores 'inward' as the other issue blocking this one", async () => {
    await DependencyService.create(actor, "a", {
      type: "BLOCKS",
      direction: "inward",
      targetKey: "ENG-2",
    });
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ sourceId: "b", targetId: "a" });
  });

  it("stores 'outward' the other way round", async () => {
    await DependencyService.create(actor, "a", {
      type: "BLOCKS",
      direction: "outward",
      targetKey: "ENG-2",
    });
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ sourceId: "a", targetId: "b" });
  });

  it("normalises a symmetric link so A↔B and B↔A are the same row", async () => {
    repo.findByKey.mockResolvedValue({ id: "aaa", key: "ENG-0", projectId: "proj-1" } as never);
    await DependencyService.create(actor, "zzz", {
      type: "RELATES_TO",
      direction: "outward",
      targetKey: "ENG-0",
    });
    // Smaller id always ends up as the source, whichever page it was made from.
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ sourceId: "aaa", targetId: "zzz" });
  });

  it("refuses a self-link", async () => {
    repo.findByKey.mockResolvedValue({ id: "a", key: "ENG-1", projectId: "proj-1" } as never);
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "outward", targetKey: "ENG-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("turns the unique-index violation into a readable 409", async () => {
    repo.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "outward", targetKey: "ENG-2" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses past the per-issue cap (BR-10)", async () => {
    repo.countForIssue.mockResolvedValue(MAX_LINKS_PER_ISSUE as never);
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "outward", targetKey: "ENG-2" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

// BR-7 — better than all three: a loop is unschedulable, so it is refused.
describe("blocking cycles", () => {
  beforeEach(() => {
    repo.findByKey.mockResolvedValue({ id: "b", key: "ENG-2", projectId: "proj-1" } as never);
    repo.create.mockResolvedValue(linkRow() as never);
  });

  it("refuses the link and names the loop as a closed ring", async () => {
    // The repository returns the EXISTING chain; the message closes it, or
    // "a loop" reads as a contradiction next to a path that plainly isn't one.
    repo.findBlockingPath.mockResolvedValue({
      found: true,
      path: ["ENG-1", "ENG-5", "ENG-9"],
    } as never);

    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "outward", targetKey: "ENG-2" }),
    ).rejects.toThrow(/ENG-1 → ENG-5 → ENG-9 → ENG-1/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses when the graph is too tangled to verify, rather than allowing it", async () => {
    repo.findBlockingPath.mockResolvedValue({ found: true, path: null } as never);
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "outward", targetKey: "ENG-2" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not run the walk at all for non-ordering link types", async () => {
    await DependencyService.create(actor, "a", {
      type: "RELATES_TO",
      direction: "outward",
      targetKey: "ENG-2",
    });
    expect(repo.findBlockingPath).not.toHaveBeenCalled();
  });
});

// BR-5/BR-11 — who may link what.
describe("permissions", () => {
  beforeEach(() => {
    repo.findByKey.mockResolvedValue({ id: "b", key: "ENG-2", projectId: "proj-2" } as never);
    repo.create.mockResolvedValue(linkRow() as never);
  });

  it("allows a cross-project link when the caller can write to ONE side", async () => {
    // Write on the caller's own project, read-only on the other — the exact
    // shape of "my work is blocked by another team's".
    projects.getMemberRole.mockImplementation(async (projectId: string) =>
      (projectId === "proj-1" ? "MEMBER" : "VIEWER") as never,
    );
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "inward", targetKey: "ENG-2" }),
    ).resolves.toBeTruthy();
  });

  it("refuses when the caller can write to neither", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER" as never);
    await expect(
      DependencyService.create(actor, "a", { type: "BLOCKS", direction: "inward", targetKey: "ENG-2" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides another tenant's link as not-found on delete", async () => {
    repo.findById.mockResolvedValue({
      id: "link-1",
      organizationId: "org-OTHER",
      sourceId: "a",
      targetId: "b",
      type: "BLOCKS",
      source: { id: "a", projectId: "proj-1" },
      target: { id: "b", projectId: "proj-1" },
    } as never);
    await expect(DependencyService.remove(actor, "link-1")).rejects.toThrow(/not found/i);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

// BR-9 — the half Jira does not have.
describe("closing a blocker", () => {
  it("tells whoever was waiting", async () => {
    repo.newlyUnblockedTargets.mockResolvedValue([
      { id: "a", key: "ENG-1", title: "The blocked one", assigneeId: "u9", reporterId: "u8" },
    ] as never);

    await DependencyService.notifyUnblocked(actor, { id: "b", key: "ENG-2" });

    expect(notifications.issueUnblocked).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ issueKey: "ENG-1", blockerKey: "ENG-2" }),
    );
  });

  it("says nothing when another blocker is still open — the repository decides that", async () => {
    repo.newlyUnblockedTargets.mockResolvedValue([] as never);
    await DependencyService.notifyUnblocked(actor, { id: "b", key: "ENG-2" });
    expect(notifications.issueUnblocked).not.toHaveBeenCalled();
  });

  it("never lets a notification failure escape into the transition", async () => {
    repo.newlyUnblockedTargets.mockRejectedValue(new Error("db is down"));
    await expect(
      DependencyService.notifyUnblocked(actor, { id: "b", key: "ENG-2" }),
    ).resolves.toBeUndefined();
  });
});
