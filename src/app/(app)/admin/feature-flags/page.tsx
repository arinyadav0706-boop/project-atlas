// Admin is a live control plane — never serve a stale flag/settings/audit view.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { FeatureFlagsView } from "@/features/admin/components/feature-flags-view";

export default async function AdminFeatureFlagsPage() {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_FEATURE_FLAGS)) notFound();

  const flags = await FeatureFlagService.listForAdmin(actor);
  return <FeatureFlagsView initialFlags={flags} />;
}
