import { HomeRepository } from "@/features/home/repositories/home.repository";
import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import type { AttentionSource } from "@/features/home/types/attention";
import type { AttentionItemDto } from "@/features/home/types/home.types";

// V1 attention source: issues assigned to me that someone ELSE changed since I
// last looked (or that I've never opened). Uses only existing data — proof that
// the unified-attention model (ADR-0012) works before Notifications/mentions
// ship. Future sources (mentions, review requests, approvals) are added the same
// way, with no change to Home.
export const assignedChangedSource: AttentionSource = {
  key: "assigned-changed",

  async collect({ actor, memberProjectIds, limit }): Promise<AttentionItemDto[]> {
    const candidates = await HomeRepository.attentionCandidates(
      memberProjectIds,
      actor.userId,
      limit * 2, // over-fetch; filtering below removes items I've already seen
    );
    if (candidates.length === 0) return [];

    const seen = await RecentItemRepository.forEntities(
      actor.userId,
      "ISSUE",
      candidates.map((c) => c.id),
    );
    const lastSeen = new Map(seen.map((r) => [r.entityId, r.lastInteractedAt]));

    return candidates
      .filter((c) => {
        if (c.updatedBy === actor.userId) return false; // my own change isn't "attention"
        const seenAt = lastSeen.get(c.id);
        return !seenAt || c.updatedAt > seenAt;
      })
      .slice(0, limit)
      .map((c) => ({
        id: `updated:${c.id}`,
        kind: "UPDATED" as const,
        title: `${c.key} · ${c.title}`,
        href: `/projects/${c.projectId}/issues/${c.id}`,
        actorId: c.updatedBy ?? null,
        occurredAt: c.updatedAt.toISOString(),
      }));
  },
};
