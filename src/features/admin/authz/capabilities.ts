import { ForbiddenError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Capability-based authorization for the admin control plane (ADR-0022 §1).
// Admin services ask "does the actor hold this capability?" — never
// "is the actor an ADMIN?" — so delegated scopes / custom roles (15_roles.md
// Future Scope) land by changing resolveCapabilities ALONE, with no service or
// route change. This is the entire indirection, and it is deliberate.
export const AdminCapability = {
  MANAGE_ORGANIZATION: "MANAGE_ORGANIZATION",
  MANAGE_FEATURE_FLAGS: "MANAGE_FEATURE_FLAGS",
  VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
  // Consumed by User Management (module 14) when it mounts into the console.
  MANAGE_USERS: "MANAGE_USERS",
  // Teams & Hierarchy (module 20, ADR-0031) — create teams, assign managers,
  // manage membership.
  MANAGE_TEAMS: "MANAGE_TEAMS",
  // Custom fields (module 24, ADR-0042) — the org-level field library. Note
  // this governs the DEFINITIONS only; enabling a field on a project is a
  // project-LEAD action, and setting a value is an ordinary issue edit.
  MANAGE_CUSTOM_FIELDS: "MANAGE_CUSTOM_FIELDS",
} as const;

export type AdminCapability = (typeof AdminCapability)[keyof typeof AdminCapability];

const ALL_CAPABILITIES: readonly AdminCapability[] = Object.values(AdminCapability);

// The single point where roles become capabilities. In V1 an org ADMIN holds
// every capability and everyone else holds none. Delegated/granular scopes
// change only this function.
export function resolveCapabilities(actor: Actor): ReadonlySet<AdminCapability> {
  if (actor.orgRole === "ADMIN") return new Set(ALL_CAPABILITIES);
  return new Set();
}

export function hasCapability(actor: Actor, capability: AdminCapability): boolean {
  return resolveCapabilities(actor).has(capability);
}

// The server-side guard every admin service method calls first (Coding
// Standards §7). Throws ForbiddenError → 403 at the route boundary.
export function requireCapability(actor: Actor, capability: AdminCapability): void {
  if (!hasCapability(actor, capability)) {
    throw new ForbiddenError("You do not have permission to perform this admin action.");
  }
}
