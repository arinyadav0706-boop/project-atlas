"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { STATUS_META, weeksLabel } from "@/features/workload/components/status-meta";
import type { WorkloadRowDto, WorkloadStatus } from "@/features/workload/types/workload.types";

// The two actionable lists — who is over, and who has room — side by side,
// because rebalancing is a move *from* one *to* the other.
//
// Selecting a person expands and scrolls to their row in All people, where
// their issues load. The mockup draws a chevron here; without a destination it
// would be decoration, and this is the only destination that exists — Workload
// is deliberately read-only, and there is no cross-project issue list to hand
// off to (21_workload.md §1).
const PREVIEW_ROWS = 5;

export function PersonFocusList({
  status,
  rows,
  icon,
  emptyText,
  onSelect,
  onViewAll,
}: {
  status: WorkloadStatus;
  /** Already filtered to this band, in the service's most-loaded-first order. */
  rows: WorkloadRowDto[];
  icon: React.ReactNode;
  emptyText: string;
  onSelect: (userId: string) => void;
  onViewAll: () => void;
}) {
  const meta = STATUS_META[status];
  const shown = rows.slice(0, PREVIEW_ROWS);

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={icon}
        title={meta.label}
        action={
          rows.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {rows.length}
            </span>
          )
        }
      />
      <CardContent className="flex flex-1 flex-col px-2 pb-2">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((row) => (
              <li key={row.userId}>
                <button
                  type="button"
                  onClick={() => onSelect(row.userId)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">
                      {row.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {row.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                      meta.chip,
                    )}
                  >
                    {weeksLabel(row)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {rows.length > shown.length && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-auto inline-flex items-center gap-1.5 px-3 pt-3 text-[13px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            View all {rows.length}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
