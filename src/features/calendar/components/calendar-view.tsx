"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import {
  IssueFilterBar,
  type ProjectOption,
} from "@/features/saved-views/components/issue-filter-bar";
import {
  addDays,
  addMonths,
  daysBetween,
  spanOf,
  startOfDay,
  startOfMonth,
  toDayString,
} from "@/shared/lib/day";
import {
  MAX_LANES_PER_DAY,
  MAX_LANES_PER_WEEK_VIEW,
  monthWindow,
  weekWindow,
} from "@/features/calendar/lib/grid";
import { CalendarGrid, EventChip } from "@/features/calendar/components/calendar-grid";
import { UnscheduledPanel } from "@/features/calendar/components/unscheduled-panel";
import { useDayDrag, type DragPayload } from "@/features/calendar/hooks/use-day-drag";
import type {
  CalendarDto,
  CalendarEventDto,
} from "@/features/calendar/types/calendar.types";

// The Calendar (29_calendar.md §5, ADR-0048).

type Mode = "MONTH" | "WEEK";

const MONTH_LABEL = { month: "long", year: "numeric", timeZone: "UTC" } as const;
const RANGE_LABEL = { day: "numeric", month: "short", timeZone: "UTC" } as const;

export function CalendarView({
  projectId,
  projects,
  currentUserId,
  initialFilter,
}: {
  projectId: string;
  projects: ProjectOption[];
  currentUserId: string;
  initialFilter: IssueFilter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<IssueFilter>(initialFilter);
  const [mode, setMode] = useState<Mode>("MONTH");
  // One clock for the whole render: reading `new Date()` in several places
  // could put the today-pill and an event on different days across midnight.
  const today = useMemo(() => startOfDay(new Date()), []);
  const [anchor, setAnchor] = useState<Date>(today);
  const [data, setData] = useState<CalendarDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Guards a slow response landing after a faster later one.
  const requestId = useRef(0);

  const window = useMemo(
    () => (mode === "MONTH" ? monthWindow(anchor) : weekWindow(anchor)),
    [mode, anchor],
  );

  const load = useCallback(
    async (next: IssueFilter, from: Date, to: Date) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const q = issueFilterToQuery(next);
        q.set("from", toDayString(from));
        q.set("to", toDayString(to));
        const res = await apiRequest<CalendarDto>(
          `/api/projects/${projectId}/calendar?${q.toString()}`,
        );
        if (id !== requestId.current) return;
        setData(res);
      } catch (error) {
        if (id !== requestId.current) return;
        toast.error(error instanceof Error ? error.message : "Couldn't load the calendar.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load(filter, window.from, window.to);
  }, [filter, window, load]);

  const byId = useMemo(() => {
    const map = new Map<string, CalendarEventDto>();
    for (const e of data?.events ?? []) map.set(e.id, e);
    for (const e of data?.unscheduled ?? []) map.set(e.id, e);
    return map;
  }, [data]);

  /**
   * Persist a move. Both dates shift together so the duration survives (BR-6),
   * and an event that had no `startDate` keeps not having one — sending a start
   * it never had would silently convert "due Friday" into "a one-day job on
   * Friday", which is a different claim.
   */
  const commit = useCallback(
    async (event: CalendarEventDto, newDue: Date, newStart: Date | null) => {
      try {
        await apiRequest(`/api/issues/${event.id}/schedule`, {
          method: "PATCH",
          body: {
            dueDate: toDayString(newDue),
            ...(newStart ? { startDate: toDayString(newStart) } : {}),
            expectedVersion: event.version,
          },
        });
        await load(filter, window.from, window.to);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't reschedule that.");
        // Whatever went wrong, the grid is now a guess. Re-read rather than
        // leave a bar where the server did not put it.
        await load(filter, window.from, window.to);
      }
    },
    [filter, window, load, router],
  );

  const onDrop = useCallback(
    (payload: DragPayload, day: string) => {
      const event = byId.get(payload.id);
      if (!event) return;
      const target = startOfDay(`${day}T00:00:00.000Z`);
      const span = spanOf(event);

      // From the unscheduled panel: the day you drop on IS the due date, and
      // the issue stays one day long (BR-7).
      if (!span) {
        void commit(event, target, null);
        return;
      }

      // Preserve the grab offset, so the day you picked up lands where you
      // dropped it, then carry the duration with it.
      const newStart = addDays(target, -payload.grabOffsetDays);
      const duration = daysBetween(span.start, span.end);
      const newDue = addDays(newStart, duration);
      if (toDayString(newDue) === event.dueDate && toDayString(newStart) === event.startDate) {
        return; // Dropped where it already was.
      }
      void commit(event, newDue, event.startDate ? newStart : null);
    },
    [byId, commit],
  );

  const onClickEvent = useCallback(
    (payload: DragPayload) => {
      const event = byId.get(payload.id);
      if (event) router.push(`/projects/${projectId}/issues/${event.id}`);
    },
    [byId, projectId, router],
  );

  const { handlers, preview } = useDayDrag({ onDrop, onClick: onClickEvent });

  const title =
    mode === "MONTH"
      ? startOfMonth(anchor).toLocaleDateString("en", MONTH_LABEL)
      : `${window.from.toLocaleDateString("en", RANGE_LABEL)} – ${window.to.toLocaleDateString("en", RANGE_LABEL)}`;

  const step = (dir: 1 | -1) =>
    setAnchor((a) => (mode === "MONTH" ? addMonths(a, dir) : addDays(a, dir * 7)));

  const dayEvents = openDay
    ? (data?.events ?? []).filter((e) => {
        const span = spanOf(e);
        if (!span) return false;
        const d = startOfDay(`${openDay}T00:00:00.000Z`);
        return span.start.getTime() <= d.getTime() && d.getTime() <= span.end.getTime();
      })
    : [];

  return (
    <div className="space-y-4">
      <IssueFilterBar
        filter={filter}
        onChange={setFilter}
        projects={projects}
        currentUserId={currentUserId}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            Today
          </Button>
        </div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>

        <div className="ml-auto inline-flex rounded-lg border border-border p-0.5">
          {(["MONTH", "WEEK"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                mode === m
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "MONTH" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {data?.truncated && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          More issues fall in this window than the calendar draws. Narrow the filter to see
          the rest.
        </p>
      )}

      {/* Grid and panel side by side (ADR-0048 §6).

          The panel started under the grid, which made its whole reason for
          existing unreachable: a six-week month is taller than a laptop
          viewport, so dragging a row onto a day meant scrolling the page
          mid-drag. A drop target you cannot see is not a drop target. */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          {loading && !data ? (
            <Card className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </Card>
          ) : data && data.events.length === 0 && data.unscheduled.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Nothing scheduled here"
              description="No issues fall in this window. Try another month, or widen the filter."
            />
          ) : (
            <CalendarGrid
              events={data?.events ?? []}
              from={window.from}
              to={window.to}
              monthAnchor={mode === "MONTH" ? startOfMonth(anchor) : null}
              today={today}
              canEdit={Boolean(data?.canEdit)}
              maxLanes={mode === "MONTH" ? MAX_LANES_PER_DAY : MAX_LANES_PER_WEEK_VIEW}
              dragHandlers={handlers}
              draggingId={preview?.id ?? null}
              overDay={preview?.overDay ?? null}
              onOpenDay={setOpenDay}
            />
          )}
        </div>

        <div className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[300px]">
          <UnscheduledPanel
            items={data?.unscheduled ?? []}
            canEdit={Boolean(data?.canEdit)}
            dragHandlers={handlers}
            draggingId={preview?.id ?? null}
            onSchedule={(event, day) =>
              void commit(event, startOfDay(`${day}T00:00:00.000Z`), null)
            }
          />
        </div>
      </div>

      {/* The drag ghost. Fixed to the viewport and ignoring the pointer, so it
          never becomes the thing the drop hit-tests against. */}
      {preview && byId.get(preview.id) && (
        <div
          className="pointer-events-none fixed z-50 max-w-[280px] -translate-y-1/2 translate-x-3"
          style={{ left: preview.x, top: preview.y }}
        >
          <EventChip event={byId.get(preview.id)!} />
        </div>
      )}

      <Dialog open={openDay !== null} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent>
          <DialogTitle>
            {openDay &&
              startOfDay(`${openDay}T00:00:00.000Z`).toLocaleDateString("en", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
          </DialogTitle>
          <ul className="mt-3 space-y-1.5">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setOpenDay(null);
                    router.push(`/projects/${projectId}/issues/${e.id}`);
                  }}
                >
                  <EventChip event={e} />
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
