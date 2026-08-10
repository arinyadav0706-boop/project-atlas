"use client";

import { ArrowRight, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { SECTION_ORDER, STATUS_META, countByStatus } from "@/features/workload/components/status-meta";
import type { WorkloadRowDto } from "@/features/workload/types/workload.types";

// The four bands as four tiles, each stating its own threshold.
//
// The Team mix donut answers "what shape is this team"; this answers "where are
// the lines". Writing `> 2 wk` on the tile is the difference between a colour a
// reader has to decode and a rule they can check — and BR-6's bands are the
// vocabulary the entire page uses.
export function PeopleAtAGlanceCard({
  rows,
  onViewAll,
}: {
  rows: WorkloadRowDto[];
  onViewAll: () => void;
}) {
  return (
    <Card>
      <CardHeader icon={<Gauge />} title="People at a glance" />
      <CardContent>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {SECTION_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            return (
              <div
                key={status}
                className="rounded-xl border border-border bg-muted/25 px-3 py-3"
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
                <p className="mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                  {countByStatus(rows, status)}
                </p>
                {/* Two lines reserved: "No open work" wraps where the other
                    three don't, and without this its threshold line sits a row
                    lower than its neighbours' — four tiles, three baselines. */}
                <p className="mt-1.5 min-h-[2.5em] text-[12px] font-medium leading-tight text-foreground">
                  {meta.label}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">{meta.band}</p>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          View all people
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </CardContent>
    </Card>
  );
}
