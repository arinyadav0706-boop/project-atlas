import { cache } from "react";
import type { Session } from "next-auth";
import { auth } from "@/features/authentication/api/auth-config";
import { UserRepository } from "@/features/authentication/repositories/user.repository";
import type { Actor } from "@/shared/types/actor";

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

  // organizationId is on the token for sessions minted after F-1; older tokens
  // won't have it, so fall back to a lookup rather than logging the user out.
  let organizationId = session.user.organizationId;
  if (!organizationId) {
    const user = await UserRepository.findOrganizationId(session.user.id);
    if (!user) return null; // fail closed — no resolvable tenant
    organizationId = user.organizationId;
  }

  return {
    userId: session.user.id,
    orgRole: session.user.orgRole === "ADMIN" ? "ADMIN" : "MEMBER",
    organizationId,
  };
});
