"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { Pencil, TriangleAlert } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  Chart,
  categoryBarsHeight,
  categoryBarsOption,
  categoryBarsSummary,
  type CategoryBar,
  type ChartTheme,
} from "@/shared/components/charts";
import { StatusDot, statusLabel } from "@/features/issues/components/issue-meta";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type {
  DashboardWidgetDto,
  WidgetDataDto,
} from "@/features/dashboards/types/dashboard.types";

// One widget (25_dashboards.md §5).
//
// Every widget states what it is counting in its footer. A dashboard number
// with no definition beside it is the thing that makes dashboards untrusted —
// nobody can tell whether "42" is open issues, all issues, or their own.

const SPAN_CLASS: Record<DashboardWidgetDto["width"], string> = {
  SMALL: "lg:col-span-1",
  MEDIUM: "lg:col-span-2",
  LARGE: "lg:col-span-3",
};

/**
 * How many of the grid's three columns this widget occupies.
 *
 * Owned by the grid, not the card: the span has to sit on whatever element is
 * the grid's direct child, and that is the drag wrapper, not the Card.
 */
export function widgetSpanClass(width: DashboardWidgetDto["width"]): string {
  return SPAN_CLASS[width];
}

export function WidgetCard({
  widget,
  data,
  editing,
  dragHandle,
  onEdit,
  className,
}: {
  widget: DashboardWidgetDto;
  data: WidgetDataDto | undefined;
  editing: boolean;
  dragHandle?: React.ReactNode;
  onEdit: () => void;
  className?: string;
}) {
  // The same filter as a link into /issues, so a widget is a starting point
  // rather than a dead end.
  const href = useMemo(() => {
    const q = issueFilterToQuery(widget.filter).toString();
    return `/issues${q ? `?${q}` : ""}`;
  }, [widget.filter]);

  return (
    <Card className={cn("flex h-full min-h-[9rem] flex-col", className)}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        {dragHandle}
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {widget.title}
        </h3>
        {widget.filterCorrupt && (
          <TriangleAlert
            className="h-3.5 w-3.5 shrink-0 text-warning"
            aria-label="This widget's saved filter could not be read"
          />
        )}
        {editing && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${widget.title}`}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3">
        <Body data={data} href={href} />
      </div>

      <Footer widget={widget} data={data} href={href} />
    </Card>
  );
}

function Body({
  data,
  href,
}: {
  data: WidgetDataDto | undefined;
  href: string;
}) {
  if (!data) {
    return <div className="h-16 animate-pulse rounded-xl bg-muted/60" />;
  }

  if (data.kind === "unavailable") {
    return (
      <p className="flex flex-1 items-center text-[13px] text-muted-foreground">
        {data.reason}
      </p>
    );
  }

  if (data.kind === "stat") {
    return (
      <Link
        href={href}
        className="flex flex-1 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-foreground tabular-nums">
          {data.count.toLocaleString()}
        </span>
      </Link>
    );
  }

  if (data.kind === "breakdown") {
    if (data.slices.length === 0) {
      return <Empty />;
    }
    return <BreakdownChart slices={data.slices} />;
  }

  if (data.items.length === 0) return <Empty />;

  return (
    <ul className="divide-y divide-border">
      {data.items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/projects/${item.projectId}/issues/${item.id}`}
            className="flex items-center gap-2 py-1.5 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="w-12 shrink-0 truncate rounded bg-muted px-1 text-center font-mono text-[10px] text-muted-foreground">
              {item.projectKey}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
              {item.title}
            </span>
            <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <StatusDot status={item.status} />
              {statusLabel(item.status)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function BreakdownChart({ slices }: { slices: { key: string; label: string; count: number }[] }) {
  const bars: CategoryBar[] = useMemo(
    () =>
      slices.map((s) => ({
        key: s.key,
        label: s.label,
        value: s.count,
        // Status keeps its semantic colour so a slice means the same thing here
        // as it does on a board; everything else is the neutral accent.
        tone:
          s.label === "Done"
            ? "success"
            : s.label === "In Review"
              ? "warning"
              : "accent",
      })),
    [slices],
  );

  const build = useCallback((theme: ChartTheme) => categoryBarsOption(bars, theme), [bars]);

  return (
    <Chart
      buildOption={build}
      height={categoryBarsHeight(bars.length)}
      summary={categoryBarsSummary(bars)}
    />
  );
}

function Empty() {
  return (
    <p className="flex flex-1 items-center text-[13px] text-muted-foreground">
      Nothing matches this filter.
    </p>
  );
}

/**
 * What this number is counting, and where it came from.
 *
 * The scope line ("across 3 projects") is not decoration: a shared dashboard
 * shows every viewer their own slice, so two people can legitimately see
 * different numbers and this is what explains it.
 */
function Footer({
  widget,
  data,
  href,
}: {
  widget: DashboardWidgetDto;
  data: WidgetDataDto | undefined;
  href: string;
}) {
  if (!data || data.kind === "unavailable") return null;

  const scope =
    data.projectsInScope === 1 ? "1 project" : `${data.projectsInScope} projects`;
  const source = widget.savedViewName ? `“${widget.savedViewName}”` : "this filter";
  const extra =
    data.kind === "list" && data.total > data.items.length
      ? ` · ${data.total.toLocaleString()} total`
      : "";

  return (
    <div className="flex items-center gap-2 border-t border-border px-4 py-2">
      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {source} · {scope}
        {extra}
      </p>
      <Link
        href={href}
        className="shrink-0 text-[11px] font-medium text-accent hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Open
      </Link>
    </div>
  );
}
