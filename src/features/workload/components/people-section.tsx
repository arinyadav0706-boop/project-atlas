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
              <div className="divide-y divide-border rounded-md border border-border">
                {group.map((r) => {
                  const isExpanded = expanded.has(r.userId);
                  return (
                    <PersonRow
                      key={r.userId}
                      row={r}
                      isExpanded={isExpanded}
                      onToggle={() => toggle(r.userId)}
                    />
                  );
                })}
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
  isExpanded,
  onToggle,
}: {
  row: WorkloadRowDto;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[row.status];
  return (
    <article id={personRowId(row.userId)} className="bg-card">
      <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`issues-${row.userId}`}
          className="flex flex-1 items-center gap-3 text-left hover:opacity-80"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.userAvatarUrl ?? undefined} alt={row.userName} />
            <AvatarFallback>{row.userName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{row.userName}</span>
              <span className="text-xs text-muted-foreground">({row.assignedIssueCount})</span>
            </div>
            <p className="text-xs text-muted-foreground">{rowCaption(row)}</p>
          </div>
        </button>

        <div className="flex items-center justify-between gap-4 pl-7 md:pl-0">
          <div className="flex items-baseline gap-1.5">
            <span className={cn("text-base font-semibold tabular-nums", meta.fg)}>
              {Math.round(row.utilizationPct)}%
            </span>
            <span className="text-xs text-muted-foreground">
              {hours(row.allocatedHours)} / {hours(row.weeklyCapacityHours)} {weeksLabel(row.totalWeeks)}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              meta.badge,
            )}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div id={`issues-${row.userId}`} className="border-t border-border bg-muted/30 p-3">
          <PersonIssues userId={row.userId} />
        </div>
      )}
    </article>
  );
}

function PersonIssues({ userId }: { userId: string }) {
  const [issues, setIssues] = useState<WorkloadIssueDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    apiRequest<WorkloadIssueDto[]>(`/api/workload/users/${userId}`)
      .then((data) => setIssues(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load issues");
      });
  }, [userId]);

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (!issues) {
    return <p className="text-xs text-muted-foreground">Loading assigned issues...</p>;
  }
  if (issues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No active issues assigned in this window.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" aria-label="Assigned issues">
      {issues.map((i) => (
        <li
          key={i.id}
          className="flex flex-col gap-1 rounded border border-border bg-card p-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/projects/${i.projectId}/issues/${i.id}`}
              className="font-mono text-primary hover:underline"
            >
              {i.key}
            </Link>
            <span className="truncate text-foreground">{i.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{i.status}</span>
            <span className="tabular-nums">{hours(i.remainingHours)} remaining</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
