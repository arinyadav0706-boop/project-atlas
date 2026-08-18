export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { Network } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";

// A manager's read-only view of their reports (direct + descendant teams,
// ADR-0032). Workload metrics land here in Epic 3.
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
            icon={<Network />}
            title="You don't manage a team yet"
            description="An admin can assign you as a team manager, and your reports will appear here."
          />
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Network />}
            title="Your team has no members yet"
            description="Add people to the team in Admin → Teams and they will appear here."
          />
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background shadow-card">
          {reports.map((r) => (
            <li key={r.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="h-8 w-8">
                {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                <AvatarFallback className="text-xs">
                  {r.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {r.teamName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
