// Same liveness rule as the dashboard it drills into.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { loadPageData } from "@/shared/lib/load-page-data";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Users } from "lucide-react";
import { PeopleSection } from "@/features/workload/components/people-section";
import { WorkloadDetailShell } from "@/features/workload/components/workload-detail-shell";

// Everyone on the team, with the per-person drill-in (BR-11).
//
// `teamId` is a search param rather than client state because this route is
// linked INTO from the dashboard — the link has to carry which team it meant,
// or a manager of three teams lands on whichever one the service picks by
// default. `person` deep-links a single row open.
export default async function WorkloadPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; person?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const { teamId, person } = await searchParams;
  // An unscoped or cross-org teamId throws NotFoundError in the service; this
  // turns it into a 404 rather than a 500 (BR-9).
  const data = await loadPageData(() => WorkloadService.getWorkload(actor, teamId));

  const team = data.teams.find((t) => t.id === data.selectedTeamId);
  const backHref = `/workload${data.selectedTeamId ? `?teamId=${data.selectedTeamId}` : ""}`;

  return (
    <WorkloadDetailShell
      title="All people"
      subtitle="Everyone on this team, grouped by how much work is queued against them."
      teamName={team ? `${team.name} · ${team.memberCount} people` : undefined}
      backHref={backHref}
    >
      {data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="This team has no members yet"
            description="Add people to the team in Admin → Teams and their load will appear here."
          />
        </Card>
      ) : (
        <PeopleSection rows={data.rows} focusUserId={person} hideHeader />
      )}
    </WorkloadDetailShell>
  );
}
