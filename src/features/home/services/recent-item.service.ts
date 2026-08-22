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
    // A rule has no "continue working" list, and `userId` is a rule id on an
    // automation write (ADR-0050 §4) — inserting it would violate the FK to
    // `users`. The catch below would eat that, which is exactly why it is
    // checked here instead: a swallowed error per automated write is a round
    // trip and a log line for something we already know cannot apply.
    if (actor.automation) return;
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
