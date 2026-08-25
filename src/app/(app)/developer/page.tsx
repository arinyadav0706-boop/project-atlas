import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getActor } from "@/features/authentication/services/actor.service";
import { DeveloperView } from "@/features/public-api/components/developer-view";

export const metadata: Metadata = { title: "Developer · EAGLES" };

// Screen for module 33 (33_public_api.md §6). Its own page rather than a tab in
// the admin console: tokens are personal, so every member has one, while the
// admin console is capability-gated. Webhooks appear here too but only for an
// org admin — the same split GitHub uses.
export default async function DeveloperPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  // The real origin, so the copyable curl example is one somebody can paste
  // rather than a placeholder they have to edit first.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${protocol}://${host}` : "";

  return <DeveloperView baseUrl={baseUrl} />;
}
