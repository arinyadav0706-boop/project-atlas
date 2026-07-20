import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import type { Actor } from "@/shared/types/actor";
import type {
  InteractionTypeDto,
  RecentEntityTypeDto,
} from "@/features/home/types/home.types";

// Records the per-user engagement signal (ADR-0012). Best-effort: it must never
// break or slow the caller's real action (e.g. opening an issue). Swallows
// errors; can move off the request hot path (queue) at scale — see 02_home.md.
export const RecentItemService = {
  async record(
    actor: Actor,
    entityType: RecentEntityTypeDto,
    entityId: string,
    interactionType: InteractionTypeDto,
  ): Promise<void> {
    try {
      await RecentItemRepository.record({
        userId: actor.userId,
        entityType,
        entityId,
        interactionType,
      });
    } catch {
      // personalization is best-effort — never surface to the caller
    }
  },
};
