import { NextRequest } from "next/server";
import { v1Route, page, pageSize } from "@/features/public-api/lib/v1";
import { UserManagementService } from "@/features/user-management/services/user-management.service";

// The organization's people, for resolving an assignee id. Behind
// `projects:read` rather than a scope of its own: a directory is the same class
// of read as the projects it belongs to, and a sixth scope for it would be
// noise (BR-3).

export async function GET(request: NextRequest) {
  return v1Route(request, "projects:read", async ({ actor, query }) => {
    const take = pageSize(query);
    const result = await UserManagementService.list(actor, {
      q: query.get("search")?.trim() || undefined,
      page: 1,
      pageSize: take + 1,
    });
    const rows = result.data.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      orgRole: u.orgRole,
      isActive: u.isActive,
    }));
    return page(rows, take, (u) => u.id);
  });
}
