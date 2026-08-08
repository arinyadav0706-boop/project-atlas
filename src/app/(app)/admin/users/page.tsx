// Admin is a live control plane — never serve a stale user list.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { UserManagementService } from "@/features/user-management/services/user-management.service";
import { userListQuerySchema } from "@/features/user-management/validation/user-management.schemas";
import { UsersView } from "@/features/user-management/components/users-view";

export default async function AdminUsersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_USERS)) notFound();

  const parsed = userListQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data : userListQuerySchema.parse({});
  const page = await UserManagementService.list(actor, query);

  return (
    <UsersView
      page={page}
      currentUserId={actor.userId}
      filters={{ q: query.q ?? "", role: query.role ?? "", status: query.status ?? "" }}
    />
  );
}
