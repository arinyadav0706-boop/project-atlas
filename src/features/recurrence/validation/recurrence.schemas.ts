import { z } from "zod";
import { issuePriority, standaloneIssueType } from "@/features/issues/validation/issue.schemas";
import {
  isKnownTimeZone,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MODES,
} from "@/features/recurrence/lib/schedule";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/32_recurring.md.

/**
 * The widest interval the engine's 800-day search horizon covers.
 *
 * Monthly × 24 is two years, which is past the point where a recurrence is the
 * right tool. The cap and the horizon are a pair: raising one without the other
 * gives a schedule that silently never fires.
 */
export const MAX_INTERVAL = 24;
export const MAX_RECURRENCES_PER_PROJECT = 25;

const timeZone = z
  .string()
  .trim()
  .min(1)
  .refine(isKnownTimeZone, "That isn't a time zone this server recognises.");

const weekday = z.number().int().min(0).max(6);

const base = {
  name: z
    .string()
    .trim()
    .min(1, "Give the recurrence a name.")
    .max(80, "Keep the name under 80 characters."),
  mode: z.enum(RECURRENCE_MODES).default("FIXED_SCHEDULE"),
  frequency: z.enum(RECURRENCE_FREQUENCIES).default("WEEKLY"),
  interval: z.number().int().min(1).max(MAX_INTERVAL).default(1),
  startsOn: z.string().datetime(),
  // Deduplicated and sorted here rather than trusted: two Mondays in the list
  // would be harmless to the engine and confusing in the summary.
  weekdays: z
    .array(weekday)
    .max(7)
    .default([])
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  /** Minutes past local midnight. */
  timeOfDay: z.number().int().min(0).max(1439).default(540),
  timeZone: timeZone.default("UTC"),
  skipWeekends: z.boolean().default(false),
  skipIfOpen: z.boolean().default(false),
  intervalDays: z.number().int().min(1).max(365).nullable().optional(),

  // The template.
  title: z.string().trim().min(1, "Give the issue a title.").max(200),
  description: z.string().trim().max(20000).nullable().optional(),
  type: standaloneIssueType.default("TASK"),
  priority: issuePriority.default("MEDIUM"),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  /** Defaults to the creator (BR-8). */
  reporterId: z.string().trim().min(1).optional(),
  dueInDays: z.number().int().min(0).max(365).nullable().optional(),

  endsOn: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().min(1).max(1000).nullable().optional(),
};

/**
 * The cross-field rules, in one place because both create and update need them.
 *
 * Each exists because the shape is legal but the schedule it describes is not
 * one anybody meant.
 */
const coherent = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value, ctx) => {
    const v = value as Partial<z.infer<typeof createRecurrenceSchema>>;
    if (v.mode === "AFTER_COMPLETION" && !v.intervalDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Say how many days after completion the next one should appear.",
        path: ["intervalDays"],
      });
    }
    if (v.endsOn && v.startsOn && new Date(v.endsOn) <= new Date(v.startsOn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The end date has to be after the start date.",
        path: ["endsOn"],
      });
    }
  });

export const createRecurrenceSchema = coherent(z.object(base).strict());

export const updateRecurrenceSchema = coherent(
  z
    .object(
      Object.fromEntries(
        Object.entries(base).map(([key, schema]) => [
          key,
          (schema as z.ZodTypeAny).optional(),
        ]),
      ) as { [K in keyof typeof base]: z.ZodOptional<(typeof base)[K]> },
    )
    .extend({ active: z.boolean().optional() })
    .strict(),
);

export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceSchema>;
