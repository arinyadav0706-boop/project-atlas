// Workload reflects live assignment and logged time — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { WorkloadView } from "@/features/workload/components/workload-view";

// Rendered for anyone; scope is resolved server-side, so a caller with no
// managed teams simply gets the empty state (21_workload.md BR-8).
export default async function WorkloadPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const initial = await WorkloadService.getWorkload(actor);
  return <WorkloadView initial={initial} />;
}
