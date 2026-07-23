import { notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { hasCapability } from "@/features/admin/authz/capabilities";
import { ADMIN_SECTIONS } from "@/features/admin/registry/admin-sections";
import { AdminConsoleNav } from "@/features/admin/components/admin-console-nav";

// The admin console shell (13_admin.md, ADR-0022 §3). Tabs come from the
// section registry, filtered to the sections the actor's capabilities allow —
// the server-side security boundary is each service's requireCapability; this
// gating is the matching UX. A caller with no admin capability at all gets 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const allowedIds = actor
    ? ADMIN_SECTIONS.filter((s) => hasCapability(actor, s.capability)).map((s) => s.id)
    : [];
  if (allowedIds.length === 0) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Organization control plane — settings, feature flags, and audit trail.
        </p>
      </header>
      <AdminConsoleNav allowedIds={allowedIds} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
