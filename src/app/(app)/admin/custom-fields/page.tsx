// Admin is a live control plane — never serve a stale field library.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { CustomFieldsAdmin } from "@/features/custom-fields/components/custom-fields-admin";

export default async function AdminCustomFieldsPage() {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_CUSTOM_FIELDS)) notFound();

  return <CustomFieldsAdmin initial={await CustomFieldService.list(actor)} />;
}
