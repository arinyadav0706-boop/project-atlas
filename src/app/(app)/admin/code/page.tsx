// Admin is a live control plane — never serve a stale connection list.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { CodeConnectionsAdmin } from "@/features/code-integration/components/code-connections-admin";

export default async function AdminCodePage() {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_CODE_CONNECTIONS)) notFound();

  // The real origin, so the webhook URL on screen is one somebody can paste
  // into GitLab rather than a placeholder they have to assemble.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${protocol}://${host}` : "";

  return <CodeConnectionsAdmin initial={await CodeIntegrationService.list(actor, origin)} />;
}
