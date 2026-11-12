// Display formatting for the timesheet screen. Presentation only — the
// stored unit is always integer minutes (ADR-0030).

import { formatDuration } from "@/features/time-tracking/lib/duration";

// Date-only labels are built from fixed tables rather than toLocaleDateString:
// Node's and the browser's ICU data disagree on punctuation ("Mon 9 Nov" vs
// "Mon, 9 Nov"), and a server-rendered label that differs from the client's
// is a hydration error.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function minutesLabel(minutes: number): string {
  return minutes === 0 ? "—" : formatDuration(minutes);
}

// For the cell editor: what the person sees when they start typing.
export function minutesInput(minutes: number): string {
  if (minutes === 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
}

function parts(date: string): { weekday: string; day: number; month: string; year: number } {
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    weekday: WEEKDAYS[d.getUTCDay()]!,
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()]!,
    year: d.getUTCFullYear(),
  };
}

export function dayHeading(date: string): { weekday: string; day: string } {
  const p = parts(date);
  return { weekday: p.weekday, day: `${p.day} ${p.month}` };
}

export function dayLong(date: string): string {
  const p = parts(date);
  return `${p.weekday}, ${p.day} ${p.month}`;
}

export function periodLabel(start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  return `${s.weekday}, ${s.day} ${s.month} – ${e.weekday}, ${e.day} ${e.month} ${e.year}`;
}

// The two labels below use the VIEWER's clock, so they are only rendered in
// the browser (see useIsClient); the server never formats them.
// "Mon, 23 Nov, 11:00" in the viewer's own clock, plus how far away it is.
export function deadlineLabel(dueAtIso: string, now: Date = new Date()): { when: string; relative: string; overdue: boolean } {
  const due = new Date(dueAtIso);
  const when = `${due.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const ms = due.getTime() - now.getTime();
  const days = Math.round(Math.abs(ms) / 86_400_000);
  const hours = Math.round(Math.abs(ms) / 3_600_000);
  const span = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
  return ms >= 0 ? { when, relative: `due in ${span}`, overdue: false } : { when, relative: `overdue by ${span}`, overdue: true };
}

export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

export function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
