export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { loadPageData } from "@/shared/lib/load-page-data";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { ProjectBalanceCard } from "@/features/workload/components/project-balance-card";
import { WorkloadDetailShell } from "@/features/workload/components/workload-detail-shell";

// Every project this team has open work in — the complete list the dashboard
// card shows the top five of.
//
// This route exists because of how the numbers grow: four projects fit in a
// card, thirty do not, and a manager whose team spans the org still needs to
// see all thirty. Truncating on the dashboard and holding the full ranking here
// keeps the summary readable without hiding anything.
export default async function WorkloadProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const { teamId } = await searchParams;
  const data = await loadPageData(() => WorkloadService.getWorkload(actor, teamId));

  const team = data.teams.find((t) => t.id === data.selectedTeamId);
  const backHref = `/workload${data.selectedTeamId ? `?teamId=${data.selectedTeamId}` : ""}`;

  return (
    <WorkloadDetailShell
      title="Project balance"
      subtitle="Where this team's unfinished work sits, heaviest project first."
      teamName={team ? `${team.name} · ${team.memberCount} people` : undefined}
      backHref={backHref}
    >
      {/* No viewAllHref: this IS the full list, so the card renders every row
          and drops the link rather than pointing at itself. */}
      <ProjectBalanceCard projects={data.projects} />
    </WorkloadDetailShell>
  );
}
