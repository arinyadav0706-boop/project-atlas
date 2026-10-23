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
    ...over,
  };
}

const IDS = ["p1", "p2"];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("membership scope", () => {
  it("maps the caller's member projects to ids", async () => {
    home.memberProjectIds.mockResolvedValue([{ projectId: "p1" }, { projectId: "p2" }] as never);
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
    expect(truncated).toBe(false);
  });

  // The count in the panel header is `items.length`, so a capped list that does
  // not say it is capped tells somebody with forty open issues that they have
  // ten. The repository is asked for limit + 1 and the extra row never ships.
  it("asks for one more than the cap, trims it, and reports the truncation", async () => {
    home.myWork.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => issueRow(`i${i}`)) as never,
    );
    const { items, truncated } = await HomeService.myWork(actor, IDS);
    expect(home.myWork.mock.calls[0]![2]).toBe(11);
    expect(items).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it("does not claim truncation when the list lands exactly on the cap", async () => {
    home.myWork.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => issueRow(`i${i}`)) as never,
    );
    const { items, truncated } = await HomeService.myWork(actor, IDS);
    expect(items).toHaveLength(10);
    expect(truncated).toBe(false);
  });
});

describe("focus (BR-11)", () => {
  it("fills with priority work only when due items leave room", async () => {
    home.dueSoon.mockResolvedValue([issueRow("d1", { dueDate: new Date("2026-07-21T00:00:00Z") })] as never);
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
    home.focusFill.mockResolvedValue(["a", "b", "c", "d", "e", "f"].map((id) => issueRow(id)) as never);
    const { items, truncated } = await HomeService.focus(actor, IDS);
    expect(items).toHaveLength(5);
    expect(truncated).toBe(true);
  });
});

describe("summary (BR-10)", () => {
  it("combines the counts with completions from the audit log", async () => {
    home.summaryCounts.mockResolvedValue({ open: 3, dueThisWeek: 1, inProgress: 1, inReview: 1, blocked: 0 });
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
    home.summaryCounts.mockResolvedValue({ open: 0, dueThisWeek: 0, inProgress: 0, inReview: 0, blocked: 0 });
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
      { entityId: "viewed-recent", interactionType: "VIEWED", lastInteractedAt: new Date(now - 60_000) },
      { entityId: "edited-recent", interactionType: "EDITED", lastInteractedAt: new Date(now - 60_000) },
      { entityId: "done-or-gone", interactionType: "EDITED", lastInteractedAt: new Date(now) },
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
  it("lists starred first and excludes starred from recent (dedupe)", async () => {
    favorite.listEntityIds.mockResolvedValue([{ entityId: "p1" }] as never);
    recent.listByType.mockResolvedValue([
      { entityId: "p1" }, // also starred → must not appear in recent
      { entityId: "p2" },
    ] as never);
    home.projectsByIds.mockImplementation((async (ids: string[]) =>
      ids.map((id) => ({ id, key: id.toUpperCase(), name: `Project ${id}` }))) as never);

    const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
    expect(starredProjects.map((p) => p.id)).toEqual(["p1"]);
    expect(starredProjects[0]!.starred).toBe(true);
    expect(recentProjects.map((p) => p.id)).toEqual(["p2"]);
    expect(recentProjects[0]!.starred).toBe(false);
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
