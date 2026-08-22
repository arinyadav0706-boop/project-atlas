import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/board/repositories/board.repository", () => ({
  BOARD_COLUMN_LIMIT: 100,
  BoardRepository: {
    columnItems: vi.fn(),
    countByCategory: vi.fn(),
    countByStatusId: vi.fn(),
  },
}));
vi.mock("@/features/workflow/repositories/workflow.repository", () => ({
  WorkflowRepository: { list: vi.fn() },
}));

vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: {
    getContext: vi.fn(),
    getMemberRole: vi.fn(),
  },
}));

import { BoardRepository } from "@/features/board/repositories/board.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowRepository } from "@/features/workflow/repositories/workflow.repository";
import { BoardService } from "./board.service";
import { NotFoundError } from "@/shared/lib/errors";

const repo = vi.mocked(BoardRepository);
const projects = vi.mocked(ProjectService);
const workflow = vi.mocked(WorkflowRepository);

// The seeded four (30_workflow BR-7) — what every project starts with, so these
// tests keep describing the board they described before statuses became data.
const STATUSES = [
  { id: "st-todo", name: "To Do", category: "TODO", color: "slate", position: 0, isDefault: true },
  { id: "st-ip", name: "In Progress", category: "IN_PROGRESS", color: "sky", position: 1, isDefault: false },
  { id: "st-review", name: "In Review", category: "IN_REVIEW", color: "amber", position: 2, isDefault: false },
  { id: "st-done", name: "Done", category: "DONE", color: "emerald", position: 3, isDefault: false },
] as const;

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
  enforceTransitions: false,
};

function card(id: string, statusId: string) {
  const status = STATUSES.find((s) => s.id === statusId)!;
  return {
    id,
    projectId: "proj-1",
    key: `ENG-${id}`,
    type: "TASK",
    title: id,
    status: status.category,
    workflowStatus: status,
    priority: "MEDIUM",
    storyPoints: null,
    updatedAt: new Date("2026-07-14T00:00:00Z"),
    version: 0,
    assignee: null,
    labels: [],
    components: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
  workflow.list.mockResolvedValue(STATUSES as never);
  // One card per column, keyed by status id, so we can assert column mapping.
  repo.columnItems.mockImplementation(
    ((_p: string, statusId: string) => Promise.resolve([card(statusId, statusId)])) as never,
  );
  repo.countByCategory.mockResolvedValue([
    { status: "TODO", _count: { _all: 3 } },
    { status: "DONE", _count: { _all: 1 } },
  ] as never);
  repo.countByStatusId.mockResolvedValue([
    { statusId: "st-todo", _count: { _all: 3 } },
    { statusId: "st-done", _count: { _all: 1 } },
  ] as never);
});

describe("getBoard", () => {
  it("returns a column per project status, in the team's order, each ordered by rank", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.columns.map((c) => c.status.category)).toEqual([
      "TODO",
      "IN_PROGRESS",
      "IN_REVIEW",
      "DONE",
    ]);
    expect(board.columns[0]!.items).toHaveLength(1);
  });

  it("computes per-status counts with ALL as the sum", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.counts).toMatchObject({
      ALL: 4,
      TODO: 3,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 1,
    });
  });

  it("grants canWrite to MEMBER/LEAD", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.canWrite).toBe(true);
  });

  it("makes the board read-only (canWrite=false) for a VIEWER (BR-5)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.canWrite).toBe(false);
  });

  it("still shows the board to a non-member of the project (org-visible, BR-1)", async () => {
    projects.getMemberRole.mockResolvedValue(null);
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.canWrite).toBe(false);
    expect(board.columns).toHaveLength(4);
  });

  it("echoes the applied filter and passes it to the repository", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const filter = { assigneeId: "u-9", type: "BUG" as const };
    const board = await BoardService.getBoard(actor, "proj-1", filter);
    expect(board.appliedFilter).toEqual(filter);
    expect(repo.columnItems).toHaveBeenCalledWith("proj-1", "st-todo", filter);
  });

  it("treats a project in another org as absent (F-1 tenant scope)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "org-2" });
    await expect(BoardService.getBoard(actor, "proj-1", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFound when the project does not exist", async () => {
    projects.getContext.mockResolvedValue(null);
    await expect(BoardService.getBoard(actor, "proj-1", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
