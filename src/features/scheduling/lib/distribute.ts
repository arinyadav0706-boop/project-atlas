// Spreading one issue's remaining effort across week buckets (ADR-0035 §2).
//
// Effort divides evenly over the WORKING days in the window — the same rule
// ClickUp uses ("split the time estimate evenly across the days between the
// start and due date"), narrowed to the organization's configured working week
// so a 6-day company spreads over six days, not five.
import {
  addUtcDays,
  countWorkingDays,
  startOfUtcDay,
  startOfUtcWeek,
} from "@/features/scheduling/lib/weeks";
import type { WeeklyDistribution } from "@/features/scheduling/types/scheduling.types";

// Turn float shares into whole minutes that still sum to exactly `total`
// (largest remainder). The grid's headline promise is that a person's columns
// add up to the single number the list view shows; naive per-cell rounding
// breaks that by a minute or two and makes the whole thing look wrong.
export function roundToTotal(shares: number[], total: number): number[] {
  const floors = shares.map((s) => Math.floor(s));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  // Hand the leftover minutes to the buckets with the largest fractional part.
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] = out[i]! + 1;
    remainder -= 1;
  }
  return out;
}

export function distributeAcrossWeeks(
  window: { from: Date; to: Date },
  minutes: number,
  horizon: Date[],
  daysPerWeek: number,
): WeeklyDistribution {
  const empty = { weeks: horizon.map(() => 0), later: 0 };
  if (minutes <= 0 || horizon.length === 0) return empty;

  const from = startOfUtcDay(window.from);
  const to = startOfUtcDay(window.to);
  const totalDays = countWorkingDays(from, to, daysPerWeek);

  // A window containing no working days at all — a task due on a Saturday at a
  // five-day company. Rather than dropping the effort, place it whole in the
  // bucket its deadline falls in.
  if (totalDays === 0) return placeWhole(to, minutes, horizon);

  // Days per bucket, then one proportional share of the effort each. Only the
  // horizon weeks are counted individually; whatever is left spreads past the
  // last column and lands in `later`.
  const perWeek = horizon.map((weekStart) => {
    const weekEnd = addUtcDays(weekStart, 6);
    const start = from.getTime() > weekStart.getTime() ? from : weekStart;
    const end = to.getTime() < weekEnd.getTime() ? to : weekEnd;
    return countWorkingDays(start, end, daysPerWeek);
  });
  const inHorizon = perWeek.reduce((a, b) => a + b, 0);

  const shares = [...perWeek, totalDays - inHorizon].map((d) => (minutes * d) / totalDays);
  const rounded = roundToTotal(shares, minutes);
  return { weeks: rounded.slice(0, horizon.length), later: rounded[horizon.length]! };
}

function placeWhole(day: Date, minutes: number, horizon: Date[]): WeeklyDistribution {
  const weeks = horizon.map(() => 0);
  const week = startOfUtcWeek(day).getTime();
  const index = horizon.findIndex((w) => w.getTime() === week);
  if (index >= 0) {
    weeks[index] = minutes;
    return { weeks, later: 0 };
  }
  // Past the last column. A day before the first column cannot occur — the
  // resolver sends anything already elapsed to Overdue — but if it ever did,
  // the nearest truthful bucket is the current week, not "later".
  if (week > horizon[0]!.getTime()) return { weeks, later: minutes };
  weeks[0] = minutes;
  return { weeks, later: 0 };
}
