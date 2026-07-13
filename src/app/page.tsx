import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/features/authentication/api/auth-config";

export default async function RootPage() {
  // Fail closed: if auth() ever throws (misconfiguration, provider
  // outage), treat the request as unauthenticated rather than risk an
  // auth bypass. redirect() itself must stay outside the try/catch — it
  // works by throwing internally, which a catch here would swallow.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  redirect(session ? "/dashboard" : "/sign-in");
}
