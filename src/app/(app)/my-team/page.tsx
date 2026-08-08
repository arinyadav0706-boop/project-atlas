export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

// A manager's read-only view of their reports (direct + descendant teams,
// ADR-0032). Workload metrics land here in Epic 3.
export default async function MyTeamPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  const { manages, reports } = await TeamService.getMyTeam(actor);

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">My team</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        People who report to you, across every team you manage.
      </p>

      {!manages ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          You don&apos;t manage a team yet. An admin can assign you as a team manager.
        </p>
      ) : reports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Your team has no members yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-background">
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
    </div>
  );
}
