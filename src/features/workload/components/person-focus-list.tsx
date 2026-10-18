"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { STATUS_META, weeksLabel } from "@/features/workload/components/status-meta";
import type {
  WorkloadRowDto,
  WorkloadStatus,
} from "@/features/workload/types/workload.types";

// The two actionable lists — who is over, and who has room — side by side,
// because rebalancing is a move *from* one *to* the other.
//
// Selecting a person opens the All-people route with that person expanded. It
// used to scroll them into view further down this same page, which is what made
// the chevron feel like a lie — you clicked a row and the page just moved.
const PREVIEW_ROWS = 5;

export function PersonFocusList({
  status,
  rows,
  icon,
  emptyText,
  personHref,
  viewAllHref,
}: {
  status: WorkloadStatus;
  /** Already filtered to this band, in the service's most-loaded-first order. */
  rows: WorkloadRowDto[];
  icon: React.ReactNode;
  emptyText: string;
  personHref: (userId: string) => string;
  viewAllHref: string;
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
          // Compact on purpose. "Nobody is over two weeks queued" is good news
          // and one line long; giving it the same 180px a five-person list gets
          // spends the column's height on an absence.
          <p className="px-3 pb-1 pt-0.5 text-[13px] text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((row) => (
              <li key={row.userId}>
                <Link
                  href={personHref(row.userId)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border/50">
                    {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">
                      {row.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {row.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                      meta.chip,
                    )}
                  >
                    {weeksLabel(row)}
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {rows.length > shown.length && (
          <Link
            href={viewAllHref}
            className="mt-auto inline-flex items-center gap-1.5 px-2.5 pt-2.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            View all {rows.length}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
