import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ReportService } from "@/features/reports/services/report.service";
import { NotFoundError } from "@/shared/lib/errors";
import { ReportCard } from "@/features/reports/components/report-card";

// Reports tab (11_reports.md, ADR-0020). Generic: lists the registered reports
// and runs each server-side, so a new report in the registry appears here with
// no page change.
export default async function ProjectReportsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const metas = await ReportService.listReports(actor, params.projectId);
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
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
