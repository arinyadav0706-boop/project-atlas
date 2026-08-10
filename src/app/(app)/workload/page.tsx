// Workload reflects live assignment and logged time — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { loadPageData } from "@/shared/lib/load-page-data";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { WorkloadView } from "@/features/workload/components/workload-view";

// Rendered for anyone; scope is resolved server-side, so a caller with no
// managed teams simply gets the empty state (21_workload.md BR-8).
//
// `teamId` is accepted so the detail routes can link back to the team the
// reader was actually looking at, rather than dumping them on the default.
export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const { teamId } = await searchParams;
  const initial = await loadPageData(() => WorkloadService.getWorkload(actor, teamId));
  return <WorkloadView initial={initial} />;
}
