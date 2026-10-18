import * as React from "react";
import { cn } from "@/shared/lib/utils";

const TONES = {
  neutral: "bg-muted/80 text-muted-foreground border border-border/40",
  accent: "bg-primary/10 text-primary border border-primary/20",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
} as const;

export type StatTone = keyof typeof TONES;

export function StatTile({
  label,
  value,
  icon,
  tone = "neutral",
  delta,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  delta?: { value: string; direction: "up" | "down" | "flat"; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface px-4 py-3 shadow-card transition-all hover:border-border-strong",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5",
              TONES[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
        {delta && (
          <span
            className={cn(
              "text-[11px] font-medium",
              delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
              delta.direction === "down" && "text-rose-600 dark:text-rose-400",
              delta.direction === "flat" && "text-muted-foreground"
            )}
          >
            {delta.direction === "up" && "↑"}
            {delta.direction === "down" && "↓"}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}
