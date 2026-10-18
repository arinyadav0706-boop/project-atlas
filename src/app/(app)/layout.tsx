import { redirect } from "next/navigation";
import { getSession, getActor } from "@/features/authentication/services/actor.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { TeamService } from "@/features/teams/services/team.service";
import { Sidebar } from "@/shared/components/app-shell/sidebar";
import { TopBar } from "@/shared/components/app-shell/top-bar";
import { AppProviders } from "./providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const actor = await getActor();
  if (!session || !actor) {
    redirect("/sign-in");
  }

  const [searchEnabled, managesTeam] = await Promise.all([
    FeatureFlagService.isEnabled(actor, "platform.commandPalette"),
    TeamService.managesAnyTeam(actor),
  ]);

  return (
    <AppProviders>
      <div className="flex h-screen overflow-hidden bg-ambient-canvas p-2 md:p-3 gap-2.5 md:gap-3">
        <Sidebar
          isOrgAdmin={actor.orgRole === "ADMIN"}
          managesTeam={managesTeam}
          user={{
            name: session.user.name ?? session.user.email ?? "User",
            email: session.user.email ?? "",
            image: session.user.image,
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-surface/90 shadow-card backdrop-blur-xl">
          <TopBar
            userName={session.user.name ?? session.user.email ?? "User"}
            userImage={session.user.image}
            searchEnabled={searchEnabled}
          />
          <main className="min-h-0 flex-1 overflow-y-auto flex flex-col">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
