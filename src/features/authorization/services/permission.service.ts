import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import { ProjectService } from "@/features/projects/services/project.service";
import { elevate } from "@/features/authorization/permission";

// The async seam future modules consume instead of re-deriving RBAC (ADR-0024).
// Resolves the caller's EFFECTIVE project role in one call: org admins short-
// circuit to LEAD (no membership lookup needed); everyone else gets their
// membership role. Callers still org-scope the project (F-1) before acting.
export const PermissionService = {
  async getEffectiveProjectRole(
    actor: Actor,
    projectId: string,
  ): Promise<ProjectRoleDto | null> {
    if (actor.orgRole === "ADMIN") return "LEAD";
    return elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  },
};
