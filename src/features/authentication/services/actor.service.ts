import { cache } from "react";
import type { Session } from "next-auth";
import { auth } from "@/features/authentication/api/auth-config";
import { UserRepository } from "@/features/authentication/repositories/user.repository";
import type { Actor } from "@/shared/types/actor";
import { UnauthorizedError } from "@/shared/lib/errors";
import { enforceRateLimit, RateLimitRules } from "@/shared/lib/rate-limit";

// Decode the session at most once per server request. A single page render
// often resolves the actor several times (layout + page + nested layouts);
// React's cache() memoizes the JWT verification across all of them.
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    return await auth();
  } catch {
    // Fail closed: an error reading the session is treated as unauthenticated.
    return null;
  }
});

// The cross-feature seam other features use to resolve the authenticated
// caller (Feature Architecture §4 — features depend on each other's
// services, never on auth internals).
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session?.user?.id) return null;

  // F2 (ADR-0029): re-read live account state on every request so revocation
  // and role changes take effect on the NEXT request — not only when the 30-day
  // JWT expires. A deactivated user's session dies here; the org role comes from
  // the DB, so a demotion/promotion applies immediately. One PK read, and
  // getActor is cache()-wrapped so a full render still resolves it once.
  const state = await UserRepository.findActorState(session.user.id);
  if (!state || !state.isActive) return null; // fail closed — revoked/deleted

  return {
    userId: session.user.id,
    orgRole: state.orgRole === "ADMIN" ? "ADMIN" : "MEMBER",
    organizationId: state.organizationId,
  };
});

// The standard guard for authenticated Route Handlers: resolve the caller or
// fail with 401. Because it funnels through getActor, every caller inherits the
// F2 revocation/role recheck for free — a route physically cannot forget it.
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

// The guard for state-changing Route Handlers (POST/PATCH/PUT/DELETE): same as
// requireActor plus a per-user mutation rate limit (ADR-0028). Keyed on the
// user id, so no request/IP plumbing is needed — new mutation routes get both
// auth and throttling by calling this one function.
export async function requireMutationActor(): Promise<Actor> {
  const actor = await requireActor();
  await enforceRateLimit("mutation", actor.userId, RateLimitRules.mutation);
  return actor;
}
