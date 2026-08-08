import * as React from "react";
import { cn } from "@/shared/lib/utils";

// A headline number with its label and a tinted icon chip.
//
// Tones map to the existing semantic tokens rather than introducing new
// palette entries: a tile is neutral unless the number itself carries meaning
// (overloaded is bad, capacity is good). Ad-hoc hexes are banned in components
// and a "nice purple" is exactly how that ban gets broken.
const TONES = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
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
  /** Pre-formatted. The tile does not know whether this is hours or people. */
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  /**
   * Change against an earlier period. Omit it entirely when there is nothing
   * truthful to show — a tile with no delta is honest, a tile showing "↑0" or
   * an invented baseline is not.
   */
  delta?: { value: string; direction: "up" | "down" | "flat"; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-background p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4",
              TONES[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>

      {delta && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "font-medium",
              // Direction is coloured, not judged: more open issues is not
              // automatically bad, so up/down get neutral-positive tones and
              // the caller picks the tile's own tone for meaning.
              delta.direction === "up" && "text-foreground",
              delta.direction === "down" && "text-foreground",
            )}
          >
            {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}{" "}
            {delta.value}
          </span>
          {delta.label}
        </p>
      )}
    </div>
  );
}
