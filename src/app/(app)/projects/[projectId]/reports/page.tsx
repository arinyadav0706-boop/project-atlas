import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ReportService } from "@/features/reports/services/report.service";
import { ReportCard } from "@/features/reports/components/report-card";
import { loadPageData } from "@/shared/lib/load-page-data";

// Reports tab (11_reports.md, ADR-0020). Generic: lists the registered reports
// and runs each server-side, so a new report in the registry appears here with
// no page change.
export default async function ProjectReportsPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const metas = await loadPageData(() =>
    ReportService.listReports(actor, params.projectId),
  );
  const results = await Promise.all(
    metas.map((m) => ReportService.runReport(actor, params.projectId, m.id, {})),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {results.map((result) => (
        <ReportCard key={result.id} result={result} projectId={params.projectId} />
      ))}
    </div>
  );
}
