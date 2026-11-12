import { FavoriteRepository } from "@/features/home/repositories/favorite.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Explicit pins for the Home strip (ADR-0012). Starring is scoped to what the
// caller can see (F-1); unstarring your own pin is always safe.
export const FavoriteService = {
  async starProject(actor: Actor, projectId: string): Promise<void> {
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    await FavoriteRepository.add(actor.userId, "PROJECT", projectId);
  },

  async unstarProject(actor: Actor, projectId: string): Promise<void> {
    await FavoriteRepository.remove(actor.userId, "PROJECT", projectId);
  },

  isProjectStarred(actor: Actor, projectId: string): Promise<boolean> {
    return FavoriteRepository.exists(actor.userId, "PROJECT", projectId);
  },

  // Timesheet activity favourites (ADR-0059 §3.1). The caller (the timesheets
  // service) has already checked the activity is in the actor's org and
  // visible to them; this only records the preference.
  async starActivity(actor: Actor, activityId: string): Promise<void> {
    await FavoriteRepository.add(actor.userId, "ACTIVITY", activityId);
  },

  async unstarActivity(actor: Actor, activityId: string): Promise<void> {
    await FavoriteRepository.remove(actor.userId, "ACTIVITY", activityId);
  },

  async starredActivityIds(actor: Actor): Promise<Set<string>> {
    const rows = await FavoriteRepository.listEntityIds(actor.userId, "ACTIVITY");
    return new Set(rows.map((r) => r.entityId));
  },
};
