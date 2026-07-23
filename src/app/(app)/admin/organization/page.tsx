// Admin is a live control plane — never serve a stale flag/settings/audit view.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { OrganizationService } from "@/features/admin/services/organization.service";
import { OrganizationSettingsForm } from "@/features/admin/components/organization-settings-form";

export default async function AdminOrganizationPage() {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_ORGANIZATION)) notFound();

  const settings = await OrganizationService.getSettings(actor);
  return <OrganizationSettingsForm settings={settings} />;
}
