import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/backlog/repositories/backlog.repository", () => ({
  DEFAULT_BACKLOG_PAGE_SIZE: 50,
  MAX_BACKLOG_PAGE_SIZE: 100,
  BacklogRepository: {
    listUnscheduled: vi.fn(),
    countUnscheduled: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: {
    getContext: vi.fn(),
    getMemberRole: vi.fn(),
  },
}));

import { BacklogRepository } from "@/features/backlog/repositories/backlog.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { BacklogService } from "./backlog.service";
import { NotFoundError } from "@/shared/lib/errors";

const repo = vi.mocked(BacklogRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
};

function card(id: string) {
  return {
    id,
    projectId: "proj-1",
    key: `ENG-${id}`,
    type: "TASK",
    title: id,
    status: "TODO",
    priority: "MEDIUM",
    storyPoints: null,
    updatedAt: new Date("2026-07-14T00:00:00Z"),
    version: 0,
    assignee: null,
    epicId: null,
    epic: null,
    // The repository always selects these two joins, so the fixture must carry
    // them — a card without them is a shape the service never actually sees.
    labels: [],
    components: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
  repo.listUnscheduled.mockResolvedValue([card("a"), card("b")] as never);
  repo.countUnscheduled.mockResolvedValue(2 as never);
});

describe("getBacklog", () => {
  it("returns unscheduled items ordered by the repository, with no more page", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const backlog = await BacklogService.getBacklog(actor, "proj-1", {});
    expect(backlog.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(backlog.nextCursor).toBeNull();
  });

  it("detects a further page and returns the last visible id as the cursor", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    // pageSize + 1 rows signals another page; the extra row is trimmed.
    const rows = Array.from({ length: 51 }, (_, n) => card(`i${n}`));
    repo.listUnscheduled.mockResolvedValue(rows as never);
    const backlog = await BacklogService.getBacklog(actor, "proj-1", {});
    expect(backlog.items).toHaveLength(50);
    expect(backlog.nextCursor).toBe("i49");
  });

  it("grants canWrite to MEMBER/LEAD", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    const backlog = await BacklogService.getBacklog(actor, "proj-1", {});
    expect(backlog.canWrite).toBe(true);
  });

  it("makes the backlog read-only (canWrite=false) for a VIEWER (BR-3)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    const backlog = await BacklogService.getBacklog(actor, "proj-1", {});
    expect(backlog.canWrite).toBe(false);
  });

  it("still shows the backlog to a non-member (org-visible)", async () => {
    projects.getMemberRole.mockResolvedValue(null);
    const backlog = await BacklogService.getBacklog(actor, "proj-1", {});
    expect(backlog.canWrite).toBe(false);
    expect(backlog.items).toHaveLength(2);
  });

  it("caps an over-large take at MAX_BACKLOG_PAGE_SIZE", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await BacklogService.getBacklog(actor, "proj-1", {}, { take: 5000 });
    expect(repo.listUnscheduled).toHaveBeenCalledWith(
      "proj-1",
      {},
      { cursor: undefined, take: 100 },
    );
  });

  it("treats a project in another org as absent (F-1 tenant scope)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "org-2" });
    await expect(BacklogService.getBacklog(actor, "proj-1", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFound when the project does not exist", async () => {
    projects.getContext.mockResolvedValue(null);
    await expect(BacklogService.getBacklog(actor, "proj-1", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
