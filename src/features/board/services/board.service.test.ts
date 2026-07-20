import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/board/repositories/board.repository", () => ({
  BOARD_COLUMN_LIMIT: 100,
  BoardRepository: {
    columnItems: vi.fn(),
    countByStatus: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: {
    getContext: vi.fn(),
    getMemberRole: vi.fn(),
  },
}));

import { BoardRepository } from "@/features/board/repositories/board.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { BoardService } from "./board.service";
import { NotFoundError } from "@/shared/lib/errors";

const repo = vi.mocked(BoardRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
};

function card(id: string, status: string) {
  return {
    id,
    key: `ENG-${id}`,
    type: "TASK",
    title: id,
    status,
    priority: "MEDIUM",
    storyPoints: null,
    updatedAt: new Date("2026-07-14T00:00:00Z"),
    assignee: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
  // One card per column, keyed by status, so we can assert column mapping.
  repo.columnItems.mockImplementation(
    ((_p: string, status: string) => Promise.resolve([card(status, status)])) as never,
  );
  repo.countByStatus.mockResolvedValue([
    { status: "TODO", _count: { _all: 3 } },
    { status: "DONE", _count: { _all: 1 } },
  ] as never);
});

describe("getBoard", () => {
  it("returns the four columns in workflow order, each ordered by rank", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const board = await BoardService.getBoard(actor, "proj-1", {});
    expect(board.columns.map((c) => c.status)).toEqual([
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
    expect(repo.columnItems).toHaveBeenCalledWith("proj-1", "TODO", filter);
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
