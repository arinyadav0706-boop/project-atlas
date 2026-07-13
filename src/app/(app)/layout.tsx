import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/features/authentication/api/auth-config";
import { Sidebar } from "@/shared/components/app-shell/sidebar";
import { TopBar } from "@/shared/components/app-shell/top-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fail closed: an error from auth() must never be treated as an
  // authenticated session — see src/app/page.tsx for the same pattern.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
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
