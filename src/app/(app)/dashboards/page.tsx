// Widget data reflects live issue state — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";
import { DashboardsWorkspace } from "@/features/dashboards/components/dashboards-workspace";
import type { DashboardDto } from "@/features/dashboards/types/dashboard.types";

// Dashboards (25_dashboards.md §5, ADR-0044). No capability gate — dashboards
// are everyone's, and the security boundary is the per-viewer project scope
// resolved in the service.
export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const params = await searchParams;
  const requested = typeof params.d === "string" ? params.d : undefined;

  const [dashboards, projects, savedViews, filterableFields] = await Promise.all([
    DashboardService.list(actor),
    ProjectService.list(actor),
    SavedViewService.list(actor),
    CustomFieldService.filterable(actor),
  ]);

  // Resolved here rather than on the client so a shared link opens on the right
  // dashboard instead of flashing the first one and then switching.
  const selectedId = requested ?? dashboards[0]?.id;
  let initialDashboard: DashboardDto | null = null;
  if (selectedId) {
    try {
      initialDashboard = await DashboardService.get(actor, selectedId);
    } catch {
      // A stale or someone-else's-private link opens the picker rather than a
      // 404 — the rest of the page is still useful.
      initialDashboard = null;
    }
  }

  return (
    <DashboardsWorkspace
      initialDashboards={dashboards}
      initialDashboard={initialDashboard}
      projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
      currentUserId={actor.userId}
      savedViews={savedViews}
      filterableFields={filterableFields}
    />
  );
}
