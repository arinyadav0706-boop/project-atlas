import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/28_timeline.md §7.

/** BR-10 — beyond this the chart is unreadable and slow, and neither is a feature. */
export const MAX_TIMELINE_ROWS = 200;
/** The tray is a staging area, not a second backlog. */
export const MAX_UNSCHEDULED_ROWS = 50;

export const timelineZoom = z.enum(["DAY", "WEEK", "MONTH"]);

/** `YYYY-MM-DD`. A day, with no time to be misread in another timezone. */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "That isn't a real date.");

export const scheduleIssueSchema = z
  .object({
    // Both are optional-and-nullable: absent means "leave it", null means
    // "clear it". A drag sends both; the tray's remove action sends nulls.
    startDate: dayString.nullable().optional(),
    dueDate: dayString.nullable().optional(),
    expectedVersion: z.number().int().min(0),
  })
  // BR-4. Checked here so every write path inherits it — the drag, the tray,
  // and anything that comes later.
  .refine(
    (v) => !(v.startDate && v.dueDate) || v.startDate <= v.dueDate,
    { message: "A start date can't be after the due date.", path: ["startDate"] },
  );

export type ScheduleIssueInput = z.infer<typeof scheduleIssueSchema>;
