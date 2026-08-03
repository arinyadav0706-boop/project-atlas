import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { auditLogQuerySchema } from "@/features/admin/validation/admin.schemas";

// GET /api/admin/audit-log — paginated, filterable, newest first
// (13_admin.md, VIEW_AUDIT_LOG).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const query = auditLogQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return NextResponse.json(await AuditLogService.list(actor, query));
  });
}
