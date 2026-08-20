// The Timeline's date arithmetic, as a pure module (ADR-0047 §8).
//
// Every pixel the chart draws comes from here, and none of it touches React,
// Prisma or the DOM — which is the point. Gantt bugs are almost always
// off-by-one-day bugs, and an off-by-one you can only reproduce by dragging
// something in a browser is one you will be chasing for a week.

export type ZoomDto = "DAY" | "WEEK" | "MONTH";

/** Pixels per day at each zoom. The only place the chart's scale is decided. */
export const PX_PER_DAY: Record<ZoomDto, number> = {
  DAY: 44,
  WEEK: 14,
  MONTH: 4.5,
};

export const MS_PER_DAY = 86_400_000;

/**
 * The narrowest a bar may be drawn, whatever the zoom says.
 *
 * Without this, a one-day bar is `pxPerDay` wide — 14px at Week, 12px at Month
 * — which is not a control anybody can grab, and too narrow to host resize
 * handles. That is not a rare edge case: an issue with a due date and no start
 * IS one day (BR-3), and that is the overwhelmingly common shape of real data.
 * The first production timeline was entirely such bars, and resizing was
 * literally impossible outside Day zoom.
 *
 * The cost is honest and small: at Month zoom a one-day bar is drawn ~7 days
 * wide. A bar nobody can see or grab is worse than one slightly overstated, and
 * the exact dates are on the row and in the tooltip either way.
 */
export const MIN_BAR_PX = 30;

/**
 * Midnight UTC of the day an instant falls on.
 *
 * UTC, deliberately, everywhere in this module. A due date is a *day*, not an
 * instant — "the 14th" means the same thing in Mumbai and Lisbon — and the
 * moment local time enters the arithmetic, a bar drawn at 23:00 IST lands on
 * the wrong column for half the org. The one place local time is allowed is
 * the axis labels a human reads.
 */
export function startOfDay(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfDay(date).getTime() + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: Date | string, to: Date | string): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

/** ISO `YYYY-MM-DD` — the wire format for a day, with no time to misread. */
export function toDayString(date: Date): string {
  return startOfDay(date).toISOString().slice(0, 10);
}

/**
 * A bar's span.
 *
 * `end` is INCLUSIVE — an issue due the 14th occupies the 14th. So a one-day
 * bar has start === end and a width of one day, not zero. Getting this wrong
 * is the classic Gantt bug: every bar renders one day short and nobody can say
 * why the last day is missing.
 */
export interface Span {
  start: Date;
  end: Date;
}

/**
 * What a row's dates mean (BR-2, BR-3).
 *
 * Returns null for genuinely unscheduled work — never an invented position. An
 * issue with a due date and no start is one day long ON the due date, because
 * the deadline is the only thing anybody actually knows.
 */
export function spanOf(input: {
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
}): Span | null {
  const due = input.dueDate ? startOfDay(input.dueDate) : null;
  const start = input.startDate ? startOfDay(input.startDate) : null;
  if (!due) return null;
  if (!start || start.getTime() > due.getTime()) {
    // A start after its due date is corrupt rather than expressive; the API
    // refuses it (BR-4), and if one is already stored the chart shows the one
    // fact it can defend instead of drawing a negative-width bar.
    return { start: due, end: due };
  }
  return { start, end: due };
}

/** The union of several spans — an Epic's roll-up (BR-6). */
export function unionSpan(spans: Span[]): Span | null {
  if (spans.length === 0) return null;
  let start = spans[0]!.start;
  let end = spans[0]!.end;
  for (const s of spans.slice(1)) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return { start, end };
}

export interface Axis {
  /** First day drawn (inclusive). */
  from: Date;
  /** Last day drawn (inclusive). */
  to: Date;
  days: number;
  pxPerDay: number;
  width: number;
}

/** Padding either side, so bars never touch the edge of the chart. */
const PAD_DAYS: Record<ZoomDto, number> = { DAY: 2, WEEK: 7, MONTH: 20 };
/** A chart narrower than this has nothing to say about sequence. */
const MIN_DAYS = 14;

/**
 * The axis that contains every span, plus today.
 *
 * Today is always in range even when all the work is in the past or the future
 * — a Gantt whose "now" marker is off-screen cannot answer the only question
 * anybody brings to it, which is whether they are behind.
 */
export function buildAxis(spans: Span[], zoom: ZoomDto, today: Date): Axis {
  const points = [startOfDay(today)];
  for (const s of spans) {
    points.push(s.start, s.end);
  }
  let from = points.reduce((a, b) => (a < b ? a : b));
  let to = points.reduce((a, b) => (a > b ? a : b));

  const pad = PAD_DAYS[zoom];
  from = addDays(from, -pad);
  to = addDays(to, pad);

  const span = daysBetween(from, to) + 1;
  if (span < MIN_DAYS) to = addDays(from, MIN_DAYS - 1);

  const days = daysBetween(from, to) + 1;
  const pxPerDay = PX_PER_DAY[zoom];
  return { from, to, days, pxPerDay, width: days * pxPerDay };
}

/** Left offset in pixels for a day on this axis. */
export function xFor(axis: Axis, date: Date | string): number {
  return daysBetween(axis.from, date) * axis.pxPerDay;
}

/**
 * A bar's box. Width counts the end day, so one day is one column wide —
 * floored at `MIN_BAR_PX` so short bars stay grabbable at every zoom.
 */
export function barBox(axis: Axis, span: Span): { left: number; width: number } {
  const left = xFor(axis, span.start);
  const width = (daysBetween(span.start, span.end) + 1) * axis.pxPerDay;
  return { left, width: Math.max(width, MIN_BAR_PX) };
}

/** Pixels back to a day — the drag's whole job (ADR-0047 §8). */
export function dayAtX(axis: Axis, x: number): Date {
  return addDays(axis.from, Math.round(x / axis.pxPerDay));
}

/** Which edge of a bar a gesture is moving. */
export type DragMode = "move" | "start" | "end";

/**
 * How far the pointer must travel before a press counts as a drag rather than
 * a click (BR-15).
 *
 * This is deliberately measured in PIXELS, not in days. The first version asked
 * "did the dates change?" and treated no-change as a click — which meant a drag
 * that resolved to zero days opened the issue instead. At Day zoom one day is
 * 44px, so *any* drag shorter than 22px opened the issue; resizing a one-day
 * bar in the direction it cannot shrink always did. The user's hand moved; the
 * intent was unambiguous; the app navigated away.
 */
export const DRAG_THRESHOLD_PX = 4;

export interface DragShift {
  /** Days to move the bar's start. */
  start: number;
  /** Days to move the bar's end. */
  end: number;
}

/**
 * A pointer displacement, resolved into the days each edge should move.
 *
 * `spanDays` is the bar's current length in days (0 for a one-day bar) and
 * bounds a resize: an edge may never cross the other one, because a bar that
 * inverts sends a start-after-due pair the API refuses (BR-4). A resize that
 * clamps to zero is still a drag — it just has nothing to commit.
 */
export function resolveDrag(
  mode: DragMode,
  dxPx: number,
  pxPerDay: number,
  spanDays: number,
): DragShift {
  // Snap to whole days (BR-5) — a Gantt with times on it implies a precision
  // nobody is planning to.
  // `+ 0` normalises away negative zero, which `Math.round`/`Math.max` produce
  // freely and which then leaks into equality checks and JSON as "-0".
  const days = Math.round(dxPx / pxPerDay) + 0;
  if (mode === "move") return { start: days, end: days };
  if (mode === "start") return { start: Math.min(days, spanDays) + 0, end: 0 };
  return { start: 0, end: Math.max(days, -spanDays) + 0 };
}

/**
 * A scheduling conflict (BR-8): the blocker finishes after the dependent
 * starts, so the plan cannot happen in the order it claims.
 *
 * Same-day is fine — finishing on the 14th and starting on the 14th is tight,
 * not impossible, and flagging it would cry wolf on every hand-off.
 */
export function isConflict(blocker: Span | null, dependent: Span | null): boolean {
  if (!blocker || !dependent) return false;
  return blocker.end.getTime() > dependent.start.getTime();
}

export interface Tick {
  x: number;
  label: string;
  /** Stronger rule — a month boundary, or a week boundary at day zoom. */
  major: boolean;
}

const MONTH = { month: "short", year: "numeric", timeZone: "UTC" } as const;

/**
 * Gridlines and labels for the axis.
 *
 * One tick per day is unreadable below day zoom, so each level ticks at the
 * granularity a reader can actually take in: days, week starts, month starts.
 */
export function buildTicks(axis: Axis, zoom: ZoomDto): Tick[] {
  const ticks: Tick[] = [];
  for (let i = 0; i < axis.days; i++) {
    const day = addDays(axis.from, i);
    const isMonthStart = day.getUTCDate() === 1;
    const isWeekStart = day.getUTCDay() === 1; // Monday

    if (zoom === "DAY") {
      ticks.push({
        x: i * axis.pxPerDay,
        label: String(day.getUTCDate()),
        major: isWeekStart || isMonthStart,
      });
    } else if (zoom === "WEEK") {
      if (isWeekStart || i === 0) {
        ticks.push({
          x: i * axis.pxPerDay,
          label: `${day.getUTCDate()} ${day.toLocaleDateString("en", { month: "short", timeZone: "UTC" })}`,
          major: isMonthStart,
        });
      }
    } else if (isMonthStart || i === 0) {
      ticks.push({
        x: i * axis.pxPerDay,
        label: day.toLocaleDateString("en", MONTH),
        major: true,
      });
    }
  }
  return ticks;
}
