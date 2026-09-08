import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/home/repositories/home.repository", () => ({
  HomeRepository: {
    memberProjectIds: vi.fn(),
    myWork: vi.fn(),
    dueSoon: vi.fn(),
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
