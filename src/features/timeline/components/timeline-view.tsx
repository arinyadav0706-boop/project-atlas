"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import {
  IssueFilterBar,
  type ProjectOption,
} from "@/features/saved-views/components/issue-filter-bar";
import {
  DependencyArrows,
  TIMELINE_ROW_HEIGHT,
} from "@/features/timeline/components/dependency-arrows";
import { TimelineBar } from "@/features/timeline/components/timeline-bar";
import { UnscheduledTray } from "@/features/timeline/components/unscheduled-tray";
import {
  addDays,
  buildAxis,
  buildTicks,
  spanOf,
  startOfDay,
  toDayString,
  xFor,
  type Span,
  type ZoomDto,
} from "@/features/timeline/lib/scale";
import type {
  TimelineDto,
  TimelineRowDto,
} from "@/features/timeline/types/timeline.types";

// The Timeline (28_timeline.md §5, ADR-0047).
//
// Layout is a fixed left rail of names beside one horizontally-scrolling pane
// that holds the axis, the bars and the arrow overlay. The rail does not
// scroll sideways — a Gantt where the labels slide away from their bars is a
// picture of nothing.

const ZOOMS: { value: ZoomDto; label: string }[] = [
  { value: "DAY", label: "Day" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
];

const RAIL_W = 260;

export function TimelineView({
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
  const [zoom, setZoom] = useState<ZoomDto>("WEEK");
  const [data, setData] = useState<TimelineDto | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guards a slow response landing after a faster later one — the same
  // filter-as-you-type race the issues list has.
  const requestId = useRef(0);
  const centredOnce = useRef(false);

  const load = useCallback(
    async (next: IssueFilter) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const q = issueFilterToQuery(next).toString();
        const res = await apiRequest<TimelineDto>(
          `/api/projects/${projectId}/timeline${q ? `?${q}` : ""}`,
        );
        if (id !== requestId.current) return;
        setData(res);
      } catch (error) {
        if (id !== requestId.current) return;
        toast.error(error instanceof Error ? error.message : "Couldn't load the timeline.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  // One clock for the whole render. Reading `new Date()` in several places
  // could put the today-marker and a bar on different days across midnight.
  const today = useMemo(() => startOfDay(new Date()), []);

  const spanById = useMemo(() => {
    const map = new Map<string, Span>();
    for (const row of data?.rows ?? []) {
      const span = spanOf(row);
      if (span) map.set(row.id, span);
    }
    return map;
  }, [data]);

  const axis = useMemo(
    () => buildAxis([...spanById.values()], zoom, today),
    [spanById, zoom, today],
  );
  const ticks = useMemo(() => buildTicks(axis, zoom), [axis, zoom]);

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    (data?.rows ?? []).forEach((r, i) => map.set(r.id, i));
    return map;
  }, [data]);

  /**
   * Open on the FIRST ROW's bar, not on today.
   *
   * Scrolling to today seemed obvious and was wrong: rows are sorted by
   * effective start, so the topmost rows are the earliest-starting work — and
   * on real data their bars had already finished before today, which put the
   * entire visible top of the chart to the left of the viewport. Measured, not
   * guessed: the first four rows' bars ended at x=392..504 while the scroll sat
   * at 800. A Gantt whose first screen is blank is a broken Gantt, whatever the
   * data underneath says.
   *
   * The today line is drawn regardless and the axis is padded to contain it, so
   * "am I behind" is still answerable — it is just not what decides the
   * opening scroll position.
   *
   * Once only: yanking the viewport back after someone has scrolled to next
   * quarter is infuriating.
   */
  useEffect(() => {
    if (centredOnce.current || !data || !scrollRef.current) return;
    const firstRow = data.rows[0];
    const firstSpan = firstRow ? spanById.get(firstRow.id) : undefined;
    centredOnce.current = true;
    scrollRef.current.scrollLeft = Math.max(
      0,
      (firstSpan ? xFor(axis, firstSpan.start) : xFor(axis, today)) - 48,
    );
  }, [data, axis, today, spanById]);

  async function reschedule(row: TimelineRowDto, startShift: number, endShift: number) {
    const span = spanById.get(row.id);
    if (!span) return;
    const nextStart = addDays(span.start, startShift);
    const nextEnd = addDays(span.end, endShift);

    // Optimistic: the bar stays where it was dropped while the write lands.
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === row.id
                ? { ...r, startDate: toDayString(nextStart), dueDate: toDayString(nextEnd) }
                : r,
            ),
          }
        : prev,
    );

    try {
      await apiRequest(`/api/issues/${row.id}/schedule`, {
        method: "PATCH",
        body: {
          startDate: toDayString(nextStart),
          dueDate: toDayString(nextEnd),
          expectedVersion: row.version,
        },
      });
      // Reload rather than patching the version by hand: the move may have
      // created or cleared a conflict, and those are computed server-side.
      await load(filter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move that.");
      await load(filter);
    }
  }

  const openIssue = useCallback(
    (row: TimelineRowDto) => router.push(`/projects/${projectId}/issues/${row.id}`),
    [router, projectId],
  );

  const rows = data?.rows ?? [];
  const gridHeight = Math.max(rows.length * TIMELINE_ROW_HEIGHT, 120);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <IssueFilterBar
          filter={filter}
          projects={projects}
          currentUserId={currentUserId}
          onChange={setFilter}
        />
        <div className="ml-auto inline-flex rounded-xl border border-border p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z.value}
              type="button"
              onClick={() => setZoom(z.value)}
              aria-pressed={zoom === z.value}
              className={cn(
                "rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                zoom === z.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* The count, not just the colour: a red arrow somewhere off-screen is
          not a warning anybody receives (BR-8). */}
      {(data?.conflictCount ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-[13px] leading-relaxed text-foreground">
            <span className="font-medium">
              {data!.conflictCount} scheduling{" "}
              {data!.conflictCount === 1 ? "conflict" : "conflicts"}
            </span>{" "}
            — a blocking issue finishes after the work waiting on it is due to
            start. Those arrows are red.
          </p>
        </div>
      )}

      {data?.truncated && (
        <p className="text-[12px] text-muted-foreground">
          Showing the first 200 scheduled issues. Narrow the filter to see the rest.
        </p>
      )}

      {/* "No dependencies yet" and "arrows are broken" look identical on screen
          — both are an absence. Saying which one it is, and where the arrows
          come from, is the difference between a missing feature and a missing
          link. Only once there is something to draw them between. */}
      {data && data.rows.length > 0 && data.links.length === 0 && (
        <p className="text-[12px] text-muted-foreground">
          No dependency arrows yet — add a <span className="font-medium">Blocks</span>{" "}
          link under Linked issues on any issue, and it will be drawn here between
          the two bars.
        </p>
      )}

      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarRange />}
            title="Nothing scheduled yet"
            description="Issues appear here once they have a due date. Drag one in from Unscheduled below, or set dates on the issue itself."
          />
        ) : (
          <div className="flex">
            {/* Fixed rail — names stay put while the axis scrolls. */}
            <div className="shrink-0 border-r border-border" style={{ width: RAIL_W }}>
              <div className="h-11 border-b border-border bg-muted/30" />
              {rows.map((row) => (
                <div
                  key={row.id}
                  style={{ height: TIMELINE_ROW_HEIGHT }}
                  className="flex items-center gap-2 border-b border-border/60 px-3 last:border-b-0"
                >
                  <IssueTypeIcon type={row.type} className="h-3.5 w-3.5 shrink-0" />
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {row.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                    {row.title}
                  </span>
                </div>
              ))}
            </div>

            <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
              <div style={{ width: axis.width }} className="relative">
                {/* Axis header */}
                <div className="sticky top-0 z-10 h-11 border-b border-border bg-muted/30">
                  {ticks.map((tick) => (
                    <span
                      key={tick.x}
                      style={{ left: tick.x }}
                      className={cn(
                        "absolute top-0 pl-1 pt-3 text-[10px] tabular-nums",
                        tick.major
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>

                <div className="relative" style={{ height: gridHeight }}>
                  {/* Sprint bands, behind everything (BR-9). */}
                  {(data?.sprints ?? []).map((sprint) => {
                    const left = xFor(axis, sprint.startDate);
                    const width = xFor(axis, sprint.endDate) + axis.pxPerDay - left;
                    if (width <= 0) return null;
                    return (
                      <div
                        key={sprint.id}
                        style={{ left, width }}
                        className={cn(
                          "absolute top-0 h-full border-x border-dashed",
                          sprint.status === "ACTIVE"
                            ? "border-accent/40 bg-accent/[0.05]"
                            : "border-border bg-muted/25",
                        )}
                      >
                        <span className="absolute left-1 top-0.5 truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          {sprint.name}
                        </span>
                      </div>
                    );
                  })}

                  {/* Gridlines */}
                  {ticks.map((tick) => (
                    <div
                      key={tick.x}
                      style={{ left: tick.x }}
                      className={cn(
                        "absolute top-0 h-full w-px",
                        tick.major ? "bg-border" : "bg-border/40",
                      )}
                    />
                  ))}

                  {/* Today. The only question anybody brings to a Gantt is
                      whether they are behind, so it is the loudest line. */}
                  <div
                    style={{ left: xFor(axis, today) }}
                    className="absolute top-0 z-10 h-full w-0.5 bg-accent"
                    aria-hidden
                  />

                  {rows.map((row, i) => {
                    const span = spanById.get(row.id);
                    return (
                      <div
                        key={row.id}
                        style={{ height: TIMELINE_ROW_HEIGHT, top: i * TIMELINE_ROW_HEIGHT }}
                        className="absolute left-0 w-full border-b border-border/60"
                      >
                        {span && (
                          <TimelineBar
                            row={row}
                            span={span}
                            axis={axis}
                            canEdit={data?.canEdit ?? false}
                            onCommit={reschedule}
                            onSelect={openIssue}
                          />
                        )}
                      </div>
                    );
                  })}

                  <DependencyArrows
                    links={data?.links ?? []}
                    spanById={spanById}
                    rowIndexById={rowIndexById}
                    axis={axis}
                    height={gridHeight}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <UnscheduledTray
        items={data?.unscheduled ?? []}
        canEdit={data?.canEdit ?? false}
        onScheduled={() => load(filter)}
      />
    </div>
  );
}
