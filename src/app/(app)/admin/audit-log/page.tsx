// Admin is a live control plane — never serve a stale flag/settings/audit view.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { auditLogQuerySchema } from "@/features/admin/validation/admin.schemas";
import { AuditLogView } from "@/features/admin/components/audit-log-view";

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.VIEW_AUDIT_LOG)) notFound();

  // Tolerate junk query params — fall back to defaults rather than 500 on a
  // hand-edited URL.
  const parsed = auditLogQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data : auditLogQuerySchema.parse({});
  const page = await AuditLogService.list(actor, query);

  return (
    <AuditLogView
      page={page}
      filters={{
        action: query.action ?? "",
        entityType: query.entityType ?? "",
      }}
    />
  );
}
