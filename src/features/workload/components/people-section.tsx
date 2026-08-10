"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  SECTION_ORDER,
  STATUS_META,
  hours,
  rowCaption,
  weeksLabel,
} from "@/features/workload/components/status-meta";
import type {
  WorkloadIssueDto,
  WorkloadRowDto,
} from "@/features/workload/types/workload.types";

// Everyone on the team, grouped by band, most urgent group first — and the only
// place in the feature that can answer "what work, exactly" (BR-11).
//
// This used to live at the bottom of the Workload dashboard, where seventeen
// ~90px rows made the page 3.1 screens tall and pushed every chart above the
// fold out of reach. It is now its own route (/workload/people); the dashboard
// links here instead of scrolling to an anchor, which is what made "View all
// people" feel like it went nowhere.
//
// Expansion is owned here, not by a parent: the focus lists now navigate rather
// than reach in and open a row. The loaded issues stay row-local — they are a
// cache of a fetch, not shared state, and hoisting them would re-render the
// whole team on every drill-in.

/** Anchor id, used to bring a deep-linked person into view. */
export function personRowId(userId: string): string {
  return `workload-person-${userId}`;
}

export function PeopleSection({
  rows,
  /** Deep link from the dashboard's focus lists: expand and reveal this person. */
  focusUserId,
  /** Suppressed on /workload/people, where the page title already says it. */
  hideHeader = false,
}: {
  rows: WorkloadRowDto[];
  focusUserId?: string;
  hideHeader?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(focusUserId ? [focusUserId] : []),
  );

  const toggle = useCallback((userId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }, []);

  // Arriving from "View all overloaded" should land ON the person, not at the
  // top of a seventeen-row list. Runs once per target rather than on every
  // render, so a later manual collapse is not undone.
  useEffect(() => {
    if (!focusUserId) return;
    const target = document.getElementById(personRowId(focusUserId));
    if (!target) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  }, [focusUserId]);

  return (
    <Card>
      {!hideHeader && (
        <CardHeader
          icon={<Users />}
          title="All people"
          action={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {rows.length}
            </span>
          }
        />
      )}
      <div className={cn("flex flex-col gap-5 px-5 pb-5", hideHeader && "pt-5")}>
        {SECTION_ORDER.map((status) => {
          const group = rows.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status}>
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)}
                  aria-hidden
                />
                {STATUS_META[status].label}
                <span className="font-normal normal-case">({group.length})</span>
              </h3>
              <div className="flex flex-col gap-1.5">
                {group.map((row) => (
                  <PersonRow
                    key={row.userId}
                    row={row}
                    open={expanded.has(row.userId)}
                    onToggle={() => toggle(row.userId)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function PersonRow({
  row,
  open,
  onToggle,
}: {
  row: WorkloadRowDto;
  open: boolean;
  onToggle: () => void;
}) {
  const [issues, setIssues] = useState<WorkloadIssueDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  // Keyed off `open`, not off the click. The row can also be opened by the
  // Overloaded / Has-room cards, which never touch this component — hanging the
  // fetch on the button's handler left those rows expanded on a permanent
  // "Loading issues…". The ref keeps it to one request per row for the life of
  // the page: collapsing and reopening should not re-fetch.
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;

    let cancelled = false;
    apiRequest<WorkloadIssueDto[]>(`/api/workload/users/${row.userId}`)
      .then((data) => {
        if (!cancelled) setIssues(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load their issues.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, row.userId]);

  return (
    <div
      id={personRowId(row.userId)}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-background transition-colors",
        open ? "border-accent/40" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Avatar className="h-8 w-8 shrink-0">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
          <AvatarFallback className="text-xs">
            {row.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* The band is the group heading and the load bar lives in the chart
            above, so the row carries the name and the two figures only. */}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
          {row.name}
        </span>

        <span className="w-36 shrink-0 text-right">
          <span className="block text-[14px] font-semibold tabular-nums text-foreground">
            {weeksLabel(row)}
          </span>
          <span className="block text-[12px] text-muted-foreground">
            {rowCaption(row)}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !issues ? (
            <p className="text-sm text-muted-foreground">Loading issues…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open issues.</p>
          ) : (
            <ul className="divide-y divide-border">
              {issues.map((issue) => (
                <li key={issue.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link
                    href={`/projects/${issue.projectId}/issues/${issue.id}`}
                    className="shrink-0 font-mono text-xs text-accent hover:underline"
                  >
                    {issue.key}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {issue.title}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {issue.projectKey}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {issue.status.replace("_", " ").toLowerCase()}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {issue.estimateMinutes === null
                      ? "no est."
                      : hours(issue.remainingMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
