"use client";

import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  SECTION_ORDER,
  STATUS_META,
  countByStatus,
} from "@/features/workload/components/status-meta";
import type { WorkloadRowDto } from "@/features/workload/types/workload.types";

// The four bands as four tiles, each stating its own threshold.
//
// The Team mix donut answers "what shape is this team"; this answers "where are
// the lines". Writing `> 2 wk` on the tile is the difference between a colour a
// reader has to decode and a rule they can check — and BR-6's bands are the
// vocabulary the entire page uses.
export function PeopleAtAGlanceCard({
  rows,
  viewAllHref,
}: {
  rows: WorkloadRowDto[];
  viewAllHref: string;
}) {
  return (
    <Card>
      <CardHeader icon={<Gauge />} title="People at a glance" />
      <CardContent>
        {/* One row of four, as the mockup has it. The labels used to wrap —
            "No open work" broke onto three lines while "Balanced" stayed on
            one, giving four tiles three different heights — so the type is
            sized to the column instead: nowrap at 11px clears the ~84px a
            quarter-column leaves after padding, with the longest label
            ("No open work") the one that has to fit. */}
        <div className="grid grid-cols-4 gap-2">
          {SECTION_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            return (
              <div
                key={status}
                className="rounded-lg border border-border/70 bg-surface-sunken/40 px-2.5 py-2 shadow-2xs"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md",
                    meta.tile,
                  )}
                  aria-hidden
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p className="mt-1.5 text-lg font-bold leading-none tracking-tight text-foreground">
                  {countByStatus(rows, status)}
                </p>
                <p className="mt-1 whitespace-nowrap text-[11px] font-medium leading-tight tracking-tight text-foreground">
                  {meta.label}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                  {meta.band}
                </p>
              </div>
            );
          })}
        </div>

        <Link
          href={viewAllHref}
          className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View all people
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
