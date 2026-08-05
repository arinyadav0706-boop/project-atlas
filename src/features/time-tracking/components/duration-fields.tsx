"use client";

import { Input } from "@/shared/components/ui/input";

// Two number fields (Hours + Minutes) — structured duration entry, no free-text
// parsing, and still allows odd values like 9m (a 15-min dropdown wouldn't).
// Reused by the time-tracking panel and the create-issue estimate (ADR-0030).
export function DurationFields({
  hours,
  minutes,
  onHours,
  onMinutes,
  idPrefix,
}: {
  hours: string;
  minutes: string;
  onHours: (v: string) => void;
  onMinutes: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex items-end gap-1.5">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Hours
        <Input
          id={`${idPrefix}-h`}
          aria-label="Hours"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="0"
          value={hours}
          onChange={(e) => onHours(e.target.value)}
          className="h-8 w-16"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Minutes
        <Input
          id={`${idPrefix}-m`}
          aria-label="Minutes"
          type="number"
          min={0}
          max={59}
          inputMode="numeric"
          placeholder="0"
          value={minutes}
          onChange={(e) => onMinutes(e.target.value)}
          className="h-8 w-16"
        />
      </label>
    </div>
  );
}

// Combine the two fields into whole minutes (the minutes field may exceed 59; we
// normalize, e.g. 90m -> 1h 30m). Negative/junk clamps to 0.
export function toMinutes(hours: string, minutes: string): number {
  const h = Math.max(0, Math.floor(Number(hours) || 0));
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  return h * 60 + m;
}
