// Hours change with every save — never serve the week stale.
export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { TimesheetApprovalService } from "@/features/timesheets/services/timesheet-approval.service";
import { MyTimesheet } from "@/features/timesheets/components/my-timesheet";
import { TimesheetReview } from "@/features/timesheets/components/timesheet-review";
import { isIsoDate } from "@/features/timesheets/lib/period";
import { NotFoundError } from "@/shared/lib/errors";

// Timesheets, Screen 1 (docs/02_Modules/37_timesheets.md §5).
//   /timesheets                 → my current week
//   /timesheets?date=YYYY-MM-DD → my week containing that date
//   /timesheets?timesheet=<id>  → a notification link: my own week, or the
//                                 approver / admin view of someone else's
export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const timesheetId = one(params.timesheet);
  if (timesheetId) {
    const own = await TimesheetService.ownPeriodStartOf(actor, timesheetId);
    if (own) redirect(`/timesheets?date=${own}`);
    const view = await TimesheetApprovalService.viewWeek(actor, timesheetId).catch((error: unknown) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    });
    if (!view) notFound();
    return <TimesheetReview initialWeek={view.week} ownerName={view.ownerName} />;
  }

  const current = await TimesheetService.currentPeriodStart(actor);
  const date = one(params.date);
  // A malformed or out-of-policy date opens the current week rather than an
  // error page — a stale bookmark should still land somewhere useful.
  const periodStart =
    date && isIsoDate(date)
      ? await TimesheetService.periodStartContaining(actor, date).catch(() => current)
      : current;

  const [week, projects] = await Promise.all([
    TimesheetService.getWeek(actor, periodStart),
    ProjectService.list(actor),
  ]);
  return (
    <MyTimesheet
      key={periodStart}
      initialWeek={week}
      currentPeriodStart={current}
      projects={projects.filter((p) => p.status !== "ARCHIVED").map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
