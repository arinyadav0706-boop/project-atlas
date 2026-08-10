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
                className="rounded-xl border border-border bg-muted/25 px-2.5 py-2.5"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    meta.tile,
                  )}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="mt-2 text-[21px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                  {countByStatus(rows, status)}
                </p>
                <p className="mt-1.5 whitespace-nowrap text-[11px] font-medium leading-tight tracking-tight text-foreground">
                  {meta.label}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-[10.5px] leading-tight text-muted-foreground">
                  {meta.band}
                </p>
              </div>
            );
          })}
        </div>

        <Link
          href={viewAllHref}
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          View all people
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
