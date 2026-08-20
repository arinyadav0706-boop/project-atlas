import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CalendarService } from "@/features/calendar/services/calendar.service";
import { calendarWindowSchema } from "@/features/calendar/validation/calendar.schemas";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";

// The whole grid in one response (29_calendar.md §4, ADR-0048): events, the
// unscheduled panel and any sprints overlapping the window.
//
// Writes are NOT here. A calendar drag is `PATCH /api/issues/{id}/schedule`
// (ADR-0048 §7) — the Timeline's endpoint — so version checking, RBAC, the
// archived-project rule and the start-after-due refusal are shared rather than
// re-implemented once per view.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const query = request.nextUrl.searchParams;
    // A ZodError here is a 422 via handleRoute — an unparseable window is the
    // caller's mistake, not an empty calendar.
    const window = calendarWindowSchema.parse({
      from: query.get("from"),
      to: query.get("to"),
    });
    // The SAME parser every other list route uses, so the calendar narrows with
    // the controls people already know.
    const filter = parseIssueFilter(query);
    return NextResponse.json(
      await CalendarService.get(actor, params.projectId, window, filter),
    );
  });
}
