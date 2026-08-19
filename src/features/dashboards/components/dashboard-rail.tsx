"use client";

import { Globe, LayoutDashboard, Lock, Plus } from "lucide-react";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import type { DashboardSummaryDto } from "@/features/dashboards/types/dashboard.types";

// The dashboards a reader may open: their own, plus everything shared.
//
// Same shape as the saved-view rail on /issues, deliberately — the two lists
// answer the same kind of question and should not need learning twice.
export function DashboardRail({
  dashboards,
  activeId,
  onSelect,
  onCreate,
}: {
  dashboards: DashboardSummaryDto[];
  activeId: string | null;
  onSelect: (dashboard: DashboardSummaryDto) => void;
  onCreate: () => void;
}) {
  const mine = dashboards.filter((d) => d.canEdit);
  const shared = dashboards.filter((d) => !d.canEdit);

  return (
    <Card>
      <CardHeader
        icon={<LayoutDashboard />}
        title="Dashboards"
        action={
          <button
            type="button"
            onClick={onCreate}
            aria-label="New dashboard"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        }
      />
      <div className="px-2 pb-2">
        <Group label="Mine" dashboards={mine} activeId={activeId} onSelect={onSelect} />
        <Group label="Shared" dashboards={shared} activeId={activeId} onSelect={onSelect} />

        {dashboards.length === 0 && (
          <p className="px-3 py-4 text-[13px] text-muted-foreground">
            No dashboards yet. Create one to pin the numbers you check every day.
          </p>
        )}
      </div>
    </Card>
  );
}

function Group({
  label,
  dashboards,
  activeId,
  onSelect,
}: {
  label: string;
  dashboards: DashboardSummaryDto[];
  activeId: string | null;
  onSelect: (dashboard: DashboardSummaryDto) => void;
}) {
  if (dashboards.length === 0) return null;

  return (
    <div className="mt-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {dashboards.map((d) => {
          const active = d.id === activeId;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                {d.visibility === "SHARED" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Shared" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
                )}
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {d.widgetCount}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
