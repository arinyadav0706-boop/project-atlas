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
};
