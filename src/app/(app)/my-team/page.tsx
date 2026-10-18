export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { Network } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { MyTeamView } from "@/features/teams/components/my-team-view";

export default async function MyTeamPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  const { manages, reports } = await TeamService.getMyTeam(actor);

  return (
    <PageShell>
      <PageHeader
        icon={<Network />}
        title="My team"
        subtitle="People who report to you, across every team you manage."
        className="mb-6"
      />

      {!manages ? (
        <Card>
          <EmptyState
            icon={<Network className="h-6 w-6 text-muted-foreground" />}
            title="You don't manage a team yet"
            description="An admin can assign you as a team manager, and your reports will appear here."
          />
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Network className="h-6 w-6 text-muted-foreground" />}
            title="Your team has no members yet"
            description="Add people to the team in Admin → Teams and they will appear here."
          />
        </Card>
      ) : (
        <MyTeamView reports={reports} />
      )}
    </PageShell>
  );
}
