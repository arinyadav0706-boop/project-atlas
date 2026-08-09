import { redirect } from "next/navigation";
import { getSession, getActor } from "@/features/authentication/services/actor.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { TeamService } from "@/features/teams/services/team.service";
import { Sidebar } from "@/shared/components/app-shell/sidebar";
import { TopBar } from "@/shared/components/app-shell/top-bar";
import { AppProviders } from "./providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getSession fails closed (returns null on error) and is request-cached, so
  // the layout and the page it wraps share a single JWT verification.
  const session = await getSession();
  // getActor re-reads live account state (F2, ADR-0029), so a deactivated user
  // is bounced here mid-session, not only when their JWT expires.
  const actor = await getActor();
  if (!session || !actor) {
    redirect("/sign-in");
  }

  // The command palette is gated by a feature flag (ADR-0023) — evaluated
  // server-side here (flags are never a client boundary) and passed down. This
  // is the end-to-end proof that the flag platform gates real features.
  const [searchEnabled, managesTeam] = await Promise.all([
    FeatureFlagService.isEnabled(actor, "platform.commandPalette"),
    TeamService.managesAnyTeam(actor),
  ]);

  return (
    <AppProviders>
      <div className="flex h-screen">
        <Sidebar
          isOrgAdmin={actor.orgRole === "ADMIN"}
          managesTeam={managesTeam}
          user={{
            name: session.user.name ?? session.user.email ?? "User",
            email: session.user.email ?? "",
            image: session.user.image,
          }}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            userName={session.user.name ?? session.user.email ?? "User"}
            userImage={session.user.image}
            searchEnabled={searchEnabled}
          />
          <main className="flex-1 overflow-y-auto bg-background px-8 py-7">{children}</main>
        </div>
      </div>
    </AppProviders>
  );
}
