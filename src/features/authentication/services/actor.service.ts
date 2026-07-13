import { auth } from "@/features/authentication/api/auth-config";
import type { Actor } from "@/shared/types/actor";

// The cross-feature seam other features use to resolve the authenticated
// caller (Feature Architecture §4 — features depend on each other's
// services, never on auth internals). Fail closed: any error reading the
// session is treated as unauthenticated.
export async function getActor(): Promise<Actor | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return {
      userId: session.user.id,
      orgRole: session.user.orgRole === "ADMIN" ? "ADMIN" : "MEMBER",
    };
  } catch {
    return null;
  }
}
