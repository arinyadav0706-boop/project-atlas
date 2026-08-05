// Admin is a live control plane — never serve a stale team list.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { TeamService } from "@/features/teams/services/team.service";
import { TeamsView } from "@/features/teams/components/teams-view";

export default async function AdminTeamsPage() {
  const actor = await getActor();
  if (!actor || !hasCapability(actor, AdminCapability.MANAGE_TEAMS)) notFound();

  const [teams, users] = await Promise.all([
    TeamService.list(actor),
    TeamService.listAssignableUsers(actor),
  ]);

  return <TeamsView teams={teams} users={users} />;
}
