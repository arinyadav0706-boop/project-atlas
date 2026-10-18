import { notFound } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { hasCapability } from "@/features/admin/authz/capabilities";
import { ADMIN_SECTIONS } from "@/features/admin/registry/admin-sections";
import { AdminConsoleNav } from "@/features/admin/components/admin-console-nav";
import { AppFrame } from "@/shared/components/ui/app-frame";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const allowedIds = actor
    ? ADMIN_SECTIONS.filter((s) => hasCapability(actor, s.capability)).map((s) => s.id)
    : [];
  if (allowedIds.length === 0) notFound();

  return (
    <AppFrame className="space-y-6">
      <div className="rounded-3xl border border-border/60 hero-mesh p-6 shadow-card">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-glow">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              <Sparkles className="h-3 w-3" />
              Organization Governance
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Admin Console
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Organization control plane — settings, users, teams, feature flags, and audit trail.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border-subtle/70">
          <AdminConsoleNav allowedIds={allowedIds} />
        </div>
      </div>

      <div>{children}</div>
    </AppFrame>
  );
}
