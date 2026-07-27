import { redirect } from "next/navigation";
import { getSession, getActor } from "@/features/authentication/services/actor.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { Sidebar } from "@/shared/components/app-shell/sidebar";
import { TopBar } from "@/shared/components/app-shell/top-bar";
import { AppProviders } from "./providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getSession fails closed (returns null on error) and is request-cached, so
  // the layout and the page it wraps share a single JWT verification.
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  // The command palette is gated by a feature flag (ADR-0023) — evaluated
  // server-side here (flags are never a client boundary) and passed down. This
  // is the end-to-end proof that the flag platform gates real features.
  const actor = await getActor();
  const searchEnabled = actor
    ? await FeatureFlagService.isEnabled(actor, "platform.commandPalette")
    : false;

  return (
    <AppProviders>
      <div className="flex h-screen">
        <Sidebar isOrgAdmin={session.user.orgRole === "ADMIN"} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            userName={session.user.name ?? session.user.email ?? "User"}
            userImage={session.user.image}
            searchEnabled={searchEnabled}
          />
          <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
        </div>
      </div>
    </AppProviders>
  );
}
