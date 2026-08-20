import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/29_calendar.md §7.

/** BR-12 — beyond this the grid is unreadable and the query is slow. */
export const MAX_CALENDAR_EVENTS = 500;
/** The panel is a staging area, not a second backlog. */
export const MAX_UNSCHEDULED_EVENTS = 50;

/**
 * BR-12 — the widest window the calendar will answer for.
 *
 * A month view asks for six weeks (42 days); 62 leaves room for a week view
 * near a boundary and for a future two-month layout without another migration
 * of this constant. Anything wider is a report, not a calendar, and would let
 * one query walk a year of issues.
 */
export const MAX_WINDOW_DAYS = 62;

/** `YYYY-MM-DD`. A day, with no time to be misread in another timezone. */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "That isn't a real date.");

export const calendarWindowSchema = z
  .object({ from: dayString, to: dayString })
  .strict()
  .refine((v) => v.from <= v.to, {
    message: "The window has to end on or after it starts.",
    path: ["to"],
  })
  .refine(
    (v) =>
      (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 + 1 <=
      MAX_WINDOW_DAYS,
    { message: `A calendar window can't be wider than ${MAX_WINDOW_DAYS} days.`, path: ["to"] },
  );

export type CalendarWindowInput = z.infer<typeof calendarWindowSchema>;
