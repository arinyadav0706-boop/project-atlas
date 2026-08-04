import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/19_time_tracking.md §Validation.

// A single log is capped at 24h (1440 min) — more in one entry is a data-entry
// slip, not a real log; split across days instead.
const minutes = z
  .number({ invalid_type_error: "Enter a duration." })
  .int("Duration must be whole minutes.")
  .min(1, "Duration must be at least 1 minute.")
  .max(1440, "A single log can't exceed 24 hours (1440 min).");

const note = z.string().trim().max(1000, "Note is too long (max 1000).").optional();

// YYYY-MM-DD, and never in the future (you can't log work you haven't done).
// String compare against today's UTC date is timezone-stable for date-only.
const workDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD).")
  .refine((d) => !Number.isNaN(Date.parse(d)), "Use a valid date.")
  .refine((d) => d <= new Date().toISOString().slice(0, 10), "Date can't be in the future.");

export const createWorkLogSchema = z.object({
  minutes,
  workDate,
  note,
});

export const updateWorkLogSchema = z.object({
  minutes,
  workDate,
  note,
  // Optimistic concurrency (ADR-0011): the version the client is editing from.
  expectedVersion: z.number().int().min(0),
});

// Estimate is 0…100000 min (~1666h) or null to clear it (BR-5).
export const setEstimateSchema = z.object({
  estimateMinutes: z
    .number()
    .int("Estimate must be whole minutes.")
    .min(0, "Estimate can't be negative.")
    .max(100000, "Estimate is unrealistically large.")
    .nullable(),
});

export type CreateWorkLogInput = z.infer<typeof createWorkLogSchema>;
export type UpdateWorkLogInput = z.infer<typeof updateWorkLogSchema>;
export type SetEstimateInput = z.infer<typeof setEstimateSchema>;
