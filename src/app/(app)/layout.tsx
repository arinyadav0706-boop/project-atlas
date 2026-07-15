import { redirect } from "next/navigation";
import { getSession } from "@/features/authentication/services/actor.service";
import { Sidebar } from "@/shared/components/app-shell/sidebar";
import { TopBar } from "@/shared/components/app-shell/top-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getSession fails closed (returns null on error) and is request-cached, so
  // the layout and the page it wraps share a single JWT verification.
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-screen">
      <Sidebar isOrgAdmin={session.user.orgRole === "ADMIN"} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar userName={session.user.name ?? session.user.email ?? "User"} userImage={session.user.image} />
        <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
      </div>
    </div>
  );
}
