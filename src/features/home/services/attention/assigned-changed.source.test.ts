import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/home/repositories/home.repository", () => ({
  HomeRepository: { attentionCandidates: vi.fn() },
}));
vi.mock("@/features/home/repositories/recent-item.repository", () => ({
  RecentItemRepository: { forEntities: vi.fn() },
}));

import { HomeRepository } from "@/features/home/repositories/home.repository";
import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import { assignedChangedSource } from "./assigned-changed.source";

const home = vi.mocked(HomeRepository);
const recent = vi.mocked(RecentItemRepository);
const actor: Actor = { userId: "me", orgRole: "MEMBER", organizationId: "org-1" };

function candidate(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    key: `ENG-${id}`,
    title: id,
    projectId: "p1",
    updatedAt: new Date("2026-07-20T12:00:00Z"),
    updatedBy: "someone-else",
    ...over,
  };
}

beforeEach(() => vi.resetAllMocks());

describe("assignedChangedSource", () => {
  it("surfaces others' changes I haven't seen; hides my own and already-seen", async () => {
    home.attentionCandidates.mockResolvedValue([
      candidate("others-unseen"),
      candidate("mine", { updatedBy: "me" }),
      candidate("seen", { updatedAt: new Date("2026-07-20T12:00:00Z") }),
    ] as never);
    recent.forEntities.mockResolvedValue([
      // I looked at "seen" AFTER it was updated → not attention.
      { entityId: "seen", lastInteractedAt: new Date("2026-07-20T13:00:00Z") },
    ] as never);

    const items = await assignedChangedSource.collect({
      actor,
      memberProjectIds: ["p1"],
      limit: 10,
    });

    expect(items.map((i) => i.id)).toEqual(["updated:others-unseen"]);
    expect(items[0]!.kind).toBe("UPDATED");
    expect(items[0]!.href).toBe("/projects/p1/issues/others-unseen");
  });

  it("returns nothing when there are no candidates", async () => {
    home.attentionCandidates.mockResolvedValue([] as never);
    const items = await assignedChangedSource.collect({
      actor,
      memberProjectIds: ["p1"],
      limit: 10,
    });
    expect(items).toEqual([]);
    expect(recent.forEntities).not.toHaveBeenCalled();
  });
});
