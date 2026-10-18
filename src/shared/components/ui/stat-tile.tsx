import * as React from "react";
import { cn } from "@/shared/lib/utils";

const TONES = {
  neutral: "bg-muted text-muted-foreground border border-border/50",
  accent: "bg-primary/12 text-primary border border-primary/20",
  success:
    "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  warning:
    "bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  danger:
    "bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  purple:
    "bg-purple-500/12 text-purple-600 dark:text-purple-400 border border-purple-500/20",
} as const;

const CARD_GLOWS = {
  neutral: "from-muted/30 to-transparent",
  accent: "from-primary/[0.06] to-transparent",
  success: "from-emerald-500/[0.06] to-transparent",
  warning: "from-amber-500/[0.06] to-transparent",
  danger: "from-rose-500/[0.06] to-transparent",
  purple: "from-purple-500/[0.06] to-transparent",
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
        "relative overflow-hidden rounded-2xl border border-border/60 bg-surface bg-gradient-to-br p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover",
        CARD_GLOWS[tone],
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4",
              TONES[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              delta.direction === "up" &&
                "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
              delta.direction === "down" &&
                "bg-rose-500/12 text-rose-700 dark:text-rose-300",
              delta.direction === "flat" && "bg-muted text-muted-foreground"
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
