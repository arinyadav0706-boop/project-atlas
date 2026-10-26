import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/home/repositories/home.repository", () => ({
  HomeRepository: {
    memberProjectIds: vi.fn(),
    myWork: vi.fn(),
    dueSoon: vi.fn(),
    focusFill: vi.fn(),
    summaryCounts: vi.fn(),
    completedSince: vi.fn(),
    myReported: vi.fn(),
    mentionedIssueIds: vi.fn(),
    activityCandidates: vi.fn(),
    recentComments: vi.fn(),
    recentIssueEvents: vi.fn(),
    usersByIds: vi.fn(),
    projectStats: vi.fn(),
    upcomingDue: vi.fn(),
    upcomingSprints: vi.fn(),
    issuesByIds: vi.fn(),
    attentionCandidates: vi.fn(),
    projectsByIds: vi.fn(),
  },
}));
vi.mock("@/features/home/repositories/recent-item.repository", () => ({
  RecentItemRepository: { listByType: vi.fn(), forEntities: vi.fn() },
}));
vi.mock("@/features/home/repositories/favorite.repository", () => ({
  FavoriteRepository: { listEntityIds: vi.fn() },
}));
vi.mock("@/features/home/services/attention", () => ({
  AttentionComposer: { compose: vi.fn() },
}));
vi.mock("@/features/workload/services/workload.service", () => ({
  WorkloadService: { getMyQueue: vi.fn() },
}));

import { HomeRepository } from "@/features/home/repositories/home.repository";
import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import { FavoriteRepository } from "@/features/home/repositories/favorite.repository";
import { AttentionComposer } from "@/features/home/services/attention";
import { HomeService } from "./home.service";

const home = vi.mocked(HomeRepository);
const recent = vi.mocked(RecentItemRepository);
const favorite = vi.mocked(FavoriteRepository);
const attention = vi.mocked(AttentionComposer);

const actor: Actor = { userId: "u1", orgRole: "MEMBER", organizationId: "org-1" };

function issueRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    projectId: "p1",
    key: `ENG-${id}`,
    type: "TASK",
    title: id,
    status: "TODO",
    priority: "MEDIUM",
    storyPoints: null,
    updatedAt: new Date("2026-07-20T00:00:00Z"),
    version: 0,
    assignee: null,
    project: { name: "Platform" },
    ...over,
  };
}

const IDS = ["p1", "p2"];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("membership scope", () => {
  it("maps the caller's member projects to ids", async () => {
    home.memberProjectIds.mockResolvedValue([
      { projectId: "p1" },
      { projectId: "p2" },
    ] as never);
    expect(await HomeService.memberProjectIds(actor)).toEqual(["p1", "p2"]);
  });

  it("returns empty sections when the user is in no projects (BR-7)", async () => {
    expect(await HomeService.myWork(actor, [])).toEqual({ items: [], truncated: false });
    // `continueWorking` is ranked, not capped-with-a-count, so it stays a plain
    // array — the truncation flag exists for the sections that show a number.
    expect(await HomeService.continueWorking(actor, [])).toEqual([]);
    expect(home.myWork).not.toHaveBeenCalled();
  });
});

describe("myWork", () => {
  it("maps assigned rows to cards", async () => {
    home.myWork.mockResolvedValue([issueRow("a"), issueRow("b")] as never);
    const { items, truncated } = await HomeService.myWork(actor, IDS);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items[0]!.projectId).toBe("p1");
    expect(items[0]!.projectName).toBe("Platform");
    expect(truncated).toBe(false);
  });

  // The count in the panel header is `items.length`, so a capped list that does
  // not say it is capped tells somebody with forty open issues that they have
  // ten. The repository is asked for limit + 1 and the extra row never ships.
  it("asks for one more than the cap, trims it, and reports the truncation", async () => {
    home.myWork.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => issueRow(`i${i}`)) as never,
    );
    const { items, truncated } = await HomeService.myWork(actor, IDS);
    expect(home.myWork.mock.calls[0]![2]).toBe(7);
    expect(items).toHaveLength(6);
    expect(truncated).toBe(true);
  });

  it("does not claim truncation when the list lands exactly on the cap", async () => {
    home.myWork.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => issueRow(`i${i}`)) as never,
    );
    const { items, truncated } = await HomeService.myWork(actor, IDS);
    expect(items).toHaveLength(6);
    expect(truncated).toBe(false);
  });
});

describe("focus (BR-11)", () => {
  it("fills with priority work only when due items leave room", async () => {
    home.dueSoon.mockResolvedValue([
      issueRow("d1", { dueDate: new Date("2026-07-21T00:00:00Z") }),
    ] as never);
    home.focusFill.mockResolvedValue([issueRow("f1"), issueRow("f2")] as never);
    const { items, truncated } = await HomeService.focus(actor, IDS);
    expect(items.map((i) => i.id)).toEqual(["d1", "f1", "f2"]);
    expect(truncated).toBe(false);
    // Asks for exactly the room left, plus one to learn whether there is more.
    expect(home.focusFill.mock.calls[0]![3]).toBe(5);
  });

  it("skips the fill read when due items already fill the panel", async () => {
    const due = ["a", "b", "c", "d", "e", "f"].map((id) =>
      issueRow(id, { dueDate: new Date("2026-07-21T00:00:00Z") }),
    );
    home.dueSoon.mockResolvedValue(due as never);
    const { items, truncated } = await HomeService.focus(actor, IDS);
    expect(items).toHaveLength(5);
    expect(truncated).toBe(true);
    expect(home.focusFill).not.toHaveBeenCalled();
  });

  it("reports more when the fill itself overflows", async () => {
    home.dueSoon.mockResolvedValue([] as never);
    home.focusFill.mockResolvedValue(
      ["a", "b", "c", "d", "e", "f"].map((id) => issueRow(id)) as never,
    );
    const { items, truncated } = await HomeService.focus(actor, IDS);
    expect(items).toHaveLength(5);
    expect(truncated).toBe(true);
  });
});

describe("summary (BR-10)", () => {
  it("combines the counts with completions from the audit log", async () => {
    home.summaryCounts.mockResolvedValue({
      open: 3,
      dueThisWeek: 1,
      inProgress: 1,
      inReview: 1,
      blocked: 0,
    });
    home.completedSince.mockResolvedValue(1);
    expect(await HomeService.summary(actor, IDS)).toEqual({
      open: 3,
      dueThisWeek: 1,
      inProgress: 1,
      inReview: 1,
      blocked: 0,
      completedLast30Days: 1,
    });
    expect(home.summaryCounts).toHaveBeenCalledWith(IDS, "u1", expect.any(Date));
  });

  it("uses a 7-day due window and a 30-day completion window", async () => {
    home.summaryCounts.mockResolvedValue({
      open: 0,
      dueThisWeek: 0,
      inProgress: 0,
      inReview: 0,
      blocked: 0,
    });
    home.completedSince.mockResolvedValue(0);
    const before = Date.now();
    await HomeService.summary(actor, IDS);
    const dueBefore = (home.summaryCounts.mock.calls[0]![2] as Date).getTime();
    const since = (home.completedSince.mock.calls[0]![2] as Date).getTime();
    const day = 24 * 60 * 60 * 1000;
    expect(Math.round((dueBefore - before) / day)).toBe(7);
    expect(Math.round((before - since) / day)).toBe(30);
  });

  it("is all zeros, without a query, for someone in no projects (BR-7)", async () => {
    const s = await HomeService.summary(actor, []);
    expect(Object.values(s).every((n) => n === 0)).toBe(true);
    expect(home.summaryCounts).not.toHaveBeenCalled();
    expect(home.completedSince).not.toHaveBeenCalled();
  });
});

describe("continueWorking (BR-3 ranking)", () => {
  it("ranks by engagement weight × recency and drops issues that aren't live", async () => {
    const now = Date.now();
    recent.listByType.mockResolvedValue([
      {
        entityId: "viewed-recent",
        interactionType: "VIEWED",
        lastInteractedAt: new Date(now - 60_000),
      },
      {
        entityId: "edited-recent",
        interactionType: "EDITED",
        lastInteractedAt: new Date(now - 60_000),
      },
      {
        entityId: "done-or-gone",
        interactionType: "EDITED",
        lastInteractedAt: new Date(now),
      },
    ] as never);
    // The third id resolves to no live issue (done/deleted/out-of-scope).
    home.issuesByIds.mockResolvedValue([
      issueRow("viewed-recent"),
      issueRow("edited-recent"),
    ] as never);

    const items = await HomeService.continueWorking(actor, IDS);
    // Same recency, but EDITED (weight 3) outranks VIEWED (weight 1).
    expect(items.map((i) => i.id)).toEqual(["edited-recent", "viewed-recent"]);
    // The unresolved id is excluded.
    expect(items.map((i) => i.id)).not.toContain("done-or-gone");
  });
});

describe("projectStrip (BR-5)", () => {
  const rows = (async (ids: string[]) =>
    ids.map((id) => ({ id, key: id.toUpperCase(), name: `Project ${id}`, description: null }))) as never;
  const noStats = { byStatus: [], activeSprints: [], members: [] } as never;

  it("puts starred projects first, then the rest by recency", async () => {
    favorite.listEntityIds.mockResolvedValue([{ entityId: "p2" }] as never);
    recent.listByType.mockResolvedValue([{ entityId: "p1" }, { entityId: "p2" }] as never);
    home.projectsByIds.mockImplementation(rows);
    home.projectStats.mockResolvedValue(noStats);

    const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
    expect(starredProjects.map((p) => p.id)).toEqual(["p2"]);
    expect(starredProjects[0]!.starred).toBe(true);
    expect(recentProjects.map((p) => p.id)).toEqual(["p1"]);
    expect(recentProjects[0]!.starred).toBe(false);
  });

  it("shows at most four projects", async () => {
    favorite.listEntityIds.mockResolvedValue([{ entityId: "p6" }] as never);
    recent.listByType.mockResolvedValue(
      ["p1", "p2", "p3", "p4", "p5", "p6"].map((entityId) => ({ entityId })) as never,
    );
    home.projectsByIds.mockImplementation(rows);
    home.projectStats.mockResolvedValue(noStats);

    const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
    expect([...starredProjects, ...recentProjects].map((p) => p.id)).toEqual(["p6", "p1", "p2", "p3"]);
  });

  it("only reads projects opened in the last 30 days, so stale starred ones drop out", async () => {
    favorite.listEntityIds.mockResolvedValue([{ entityId: "stale" }] as never);
    recent.listByType.mockResolvedValue([] as never);

    const strip = await HomeService.projectStrip(actor);
    expect(strip).toEqual({ starredProjects: [], recentProjects: [] });
    const since = recent.listByType.mock.calls.at(-1)![3] as Date;
    const days = (Date.now() - since.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });
});

describe("attention", () => {
  it("delegates to the composer, scoped to member projects", async () => {
    attention.compose.mockResolvedValue([] as never);
    await HomeService.attention(actor, IDS);
    expect(attention.compose).toHaveBeenCalledWith(
      expect.objectContaining({ actor, memberProjectIds: ["p1", "p2"] }),
    );
  });
});

describe("project card stats (BR-15)", () => {
  it("folds the grouped reads into one stats object per project", async () => {
    favorite.listEntityIds.mockResolvedValue([
      { entityId: "p1" },
      { entityId: "p2" },
    ] as never);
    recent.listByType.mockResolvedValue([{ entityId: "p1" }, { entityId: "p2" }] as never);
    home.projectsByIds.mockImplementation((async (ids: string[]) =>
      ids.map((id) => ({
        id,
        key: id.toUpperCase(),
        name: id,
        description: null,
      }))) as never);
    home.projectStats.mockResolvedValue({
      byStatus: [
        { projectId: "p1", status: "TODO", _count: { _all: 6 } },
        { projectId: "p1", status: "DONE", _count: { _all: 4 } },
      ],
      activeSprints: [{ projectId: "p1", _count: { _all: 1 } }],
      members: [{ projectId: "p1", _count: { _all: 5 } }],
    } as never);

    const { starredProjects } = await HomeService.projectStrip(actor);
    expect(starredProjects.find((p) => p.id === "p1")!.stats).toEqual({
      issueCount: 10,
      doneCount: 4,
      activeSprints: 1,
      memberCount: 5,
    });
    // A project with nothing in any group still gets zeros, never undefined.
    expect(starredProjects.find((p) => p.id === "p2")!.stats).toEqual({
      issueCount: 0,
      doneCount: 0,
      activeSprints: 0,
      memberCount: 0,
    });
    // One grouped read for the whole strip, not one per card.
    expect(home.projectStats).toHaveBeenCalledTimes(1);
  });
});

describe("workTab (BR-13)", () => {
  it("reads the reporter list for Reported by me", async () => {
    home.myReported.mockResolvedValue([issueRow("r1")] as never);
    const { items } = await HomeService.workTab(actor, IDS, "reported");
    expect(items.map((i) => i.id)).toEqual(["r1"]);
    expect(home.myWork).not.toHaveBeenCalled();
  });

  it("keeps most-recent-mention order and drops repeats", async () => {
    home.mentionedIssueIds.mockResolvedValue(["b", "a", "b", "c"] as never);
    // The issue read returns rows in arbitrary order; mention order must win.
    home.issuesByIds.mockResolvedValue([
      issueRow("c"),
      issueRow("a"),
      issueRow("b"),
    ] as never);
    const { items } = await HomeService.workTab(actor, IDS, "mentioned");
    expect(items.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("drops a mentioned issue that is no longer live", async () => {
    home.mentionedIssueIds.mockResolvedValue(["gone", "a"] as never);
    home.issuesByIds.mockResolvedValue([issueRow("a")] as never);
    const { items } = await HomeService.workTab(actor, IDS, "mentioned");
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("activity (BR-14)", () => {
  const issue = { id: "i1", key: "ENG-1", title: "One", projectId: "p1" };
  const at = (min: number) => new Date(Date.now() - min * 60_000);

  beforeEach(() => {
    home.activityCandidates.mockResolvedValue([issue] as never);
    home.usersByIds.mockResolvedValue([
      { id: "u2", name: "Ana", avatarUrl: null },
      { id: "u1", name: "Me", avatarUrl: null },
    ] as never);
  });

  it("merges comments and audit events newest first", async () => {
    home.recentComments.mockResolvedValue([
      {
        id: "c1",
        issueId: "i1",
        body: "Looks **good**",
        createdAt: at(30),
        author: { id: "u2", name: "Ana", avatarUrl: null },
      },
    ] as never);
    home.recentIssueEvents.mockResolvedValue([
      {
        id: "a1",
        action: "ISSUE_STATUS_CHANGED",
        entityId: "i1",
        actorId: "u2",
        afterData: { status: "In Review", category: "IN_REVIEW" },
        createdAt: at(10),
      },
      {
        id: "a2",
        action: "ISSUE_ASSIGNEE_CHANGED",
        entityId: "i1",
        actorId: "u2",
        afterData: { assigneeId: "u1" },
        createdAt: at(60),
      },
    ] as never);

    const { items } = await HomeService.activity(actor, IDS);
    expect(items.map((i) => i.kind)).toEqual(["STATUS", "COMMENT", "ASSIGNMENT"]);
    const status = items[0]!;
    expect(status.kind === "STATUS" && status.status).toBe("In Review");
    expect(status.actor?.name).toBe("Ana");
    const assignment = items[2]!;
    expect(assignment.kind === "ASSIGNMENT" && assignment.toMe).toBe(true);
    const comment = items[1]!;
    expect(comment.href).toBe("/projects/p1/issues/i1/comments/c1");
    expect(comment.occurredAgo).toBe("30m ago");
  });

  it("only queries the source a tab needs", async () => {
    home.recentIssueEvents.mockResolvedValue([] as never);
    await HomeService.activity(actor, IDS, "assignments");
    expect(home.recentComments).not.toHaveBeenCalled();
    expect(home.recentIssueEvents.mock.calls[0]![3]).toEqual(["ISSUE_ASSIGNEE_CHANGED"]);
  });

  it("drops a status row whose audit payload has no status, rather than crashing", async () => {
    home.recentComments.mockResolvedValue([] as never);
    home.recentIssueEvents.mockResolvedValue([
      {
        id: "a1",
        action: "ISSUE_STATUS_CHANGED",
        entityId: "i1",
        actorId: "u2",
        afterData: null,
        createdAt: at(5),
      },
    ] as never);
    const { items } = await HomeService.activity(actor, IDS);
    expect(items).toEqual([]);
  });

  it("caps at five and says there is more", async () => {
    home.recentComments.mockResolvedValue(
      Array.from({ length: 6 }, (_, n) => ({
        id: `c${n}`,
        issueId: "i1",
        body: "x",
        createdAt: at(n),
        author: null,
      })) as never,
    );
    home.recentIssueEvents.mockResolvedValue([] as never);
    const { items, truncated } = await HomeService.activity(actor, IDS);
    expect(items).toHaveLength(5);
    expect(truncated).toBe(true);
    // A rule's comment has no author, and must still render as an event.
    expect(items[0]!.actor).toBeNull();
  });

  it("reads nothing for someone with no issues of their own", async () => {
    home.activityCandidates.mockResolvedValue([] as never);
    expect(await HomeService.activity(actor, IDS)).toEqual({
      items: [],
      truncated: false,
    });
    expect(home.recentComments).not.toHaveBeenCalled();
  });
});

describe("upcoming (BR-16)", () => {
  const day = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  it("merges due dates and sprint boundaries into date order", async () => {
    home.upcomingDue.mockResolvedValue([
      { id: "i1", key: "ENG-1", title: "Ship it", projectId: "p1", dueDate: day(3) },
    ] as never);
    home.upcomingSprints.mockResolvedValue([
      {
        id: "s1",
        name: "Sprint 2",
        status: "PLANNED",
        startDate: day(5),
        endDate: day(19),
        project: { id: "p1", key: "ENG", name: "Engineering" },
      },
      {
        id: "s0",
        name: "Sprint 1",
        status: "ACTIVE",
        startDate: day(-9),
        endDate: day(1),
        project: { id: "p1", key: "ENG", name: "Engineering" },
      },
    ] as never);

    const items = await HomeService.upcoming(actor, IDS);
    expect(items.map((i) => i.kind)).toEqual(["SPRINT_END", "DUE", "SPRINT_START"]);
    expect(items[0]!.href).toBe("/projects/p1/backlog");
    expect(items[1]!.context).toBe("ENG-1");
  });

  it("is capped at six", async () => {
    home.upcomingDue.mockResolvedValue(
      Array.from({ length: 6 }, (_, n) => ({
        id: `i${n}`,
        key: `K-${n}`,
        title: "t",
        projectId: "p1",
        dueDate: day(n + 1),
      })) as never,
    );
    home.upcomingSprints.mockResolvedValue([
      {
        id: "s1",
        name: "S",
        status: "PLANNED",
        startDate: day(2),
        endDate: null,
        project: { id: "p1", key: "ENG", name: "E" },
      },
    ] as never);
    expect(await HomeService.upcoming(actor, IDS)).toHaveLength(6);
  });
});

describe("tab parsing", () => {
  it("falls back to the default for anything unrecognised", async () => {
    const { parseWorkTab, parseActivityTab } = await import("./home.service");
    expect(parseWorkTab("mentioned")).toBe("mentioned");
    expect(parseWorkTab(["reported"])).toBe("assigned");
    expect(parseWorkTab(undefined)).toBe("assigned");
    expect(parseActivityTab("status")).toBe("status");
    expect(parseActivityTab("<script>")).toBe("all");
  });
});
