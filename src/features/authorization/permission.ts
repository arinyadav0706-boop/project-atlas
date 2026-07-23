import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";

// The centralized permission engine (ADR-0024). Pure rules only — no I/O — so
// every feature shares one definition of "what a role permits" and one place
// where the org-admin elevation lives. Feature services resolve the caller's
// membership role, run it through `elevate`, and gate on these predicates.

// The ONE place org-admin elevation lives (ADR-0024): an org ADMIN is an
// effective LEAD on every project in its org. Elevation is an authorization
// concept — apply it to the CALLER's role for permission decisions, never to a
// membership *fact* (e.g. "is this assignee a member?").
export function elevate(
  actor: Actor,
  membershipRole: ProjectRoleDto | null,
): ProjectRoleDto | null {
  if (actor.orgRole === "ADMIN") return "LEAD";
  return membershipRole;
}

// Can create/edit project content (issues, comments, attachments, board/backlog
// moves, sprint membership) — MEMBER or LEAD.
export function canWriteContent(role: ProjectRoleDto | null): boolean {
  return role === "MEMBER" || role === "LEAD";
}

// Can manage the project itself (settings, membership, sprints lifecycle,
// components, moderation) — LEAD only.
export function canManageProject(role: ProjectRoleDto | null): boolean {
  return role === "LEAD";
}
