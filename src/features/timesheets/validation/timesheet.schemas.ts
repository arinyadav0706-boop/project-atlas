import { z } from "zod";
import { parseDuration } from "@/features/time-tracking/lib/duration";
import { isIsoDate } from "@/features/timesheets/lib/period";

// One schema per action, shared by the grid and the route handlers
// (Coding Standards §3). Constraints: docs/02_Modules/37_timesheets.md §7.

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");

const id = z.string().trim().min(1).max(64);
const note = z.string().trim().max(1000, "Note is too long (max 1000).");
const version = z.number().int().min(0);

// BR-5: "1:30", "1.5", "1h 30m", "90m"; a bare number is hours; "0" clears.
export const durationSchema = z
  .string()
  .max(20)
  .transform((raw, ctx) => {
    const minutes = parseDuration(raw);
    if (minutes === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a duration like 1:30, 1.5, 1h 30m or 90m (up to 24h).",
      });
      return z.NEVER;
    }
    return minutes;
  });

export const saveCellSchema = z.object({
  duration: durationSchema,
  note: note.nullable().optional(),
  expectedVersion: version.optional(),
});
export type SaveCellInput = z.infer<typeof saveCellSchema>;

// Exactly one of issueId / activityId; project/client tags only with an
// activity (BR-4) — the same rule the database CHECK enforces.
export const rowInputSchema = z
  .object({
    issueId: id.optional(),
    activityId: id.optional(),
    projectId: id.nullable().optional(),
    clientId: id.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.issueId) === Boolean(v.activityId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an issue or an activity." });
    }
    if (v.issueId && (v.projectId || v.clientId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Project and client tags apply to activities only.",
      });
    }
  });
export type RowInput = z.infer<typeof rowInputSchema>;

export const updateRowSchema = z
  .object({
    issueId: id.optional(),
    activityId: id.optional(),
    projectId: id.nullable().optional(),
    clientId: id.nullable().optional(),
    billableOverride: z.boolean().nullable().optional(),
    expectedVersion: version,
  })
  .superRefine((v, ctx) => {
    if (v.issueId && v.activityId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an issue or an activity, not both." });
    }
  });
export type UpdateRowInput = z.infer<typeof updateRowSchema>;

export const moveRowSchema = z.object({ direction: z.enum(["up", "down"]) });

export const submitSchema = z.object({ expectedVersion: version });

export const approveSchema = z.object({ comment: z.string().trim().max(1000).optional() });

export const returnSchema = z.object({
  rows: z
    .array(z.object({ rowId: id, reason: z.string().trim().min(1, "Give a reason.").max(500) }))
    .min(1, "Return at least one line."),
  comment: z.string().trim().max(1000).optional(),
});
export type ReturnInput = z.infer<typeof returnSchema>;

export const unlockSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to unlock a week.").max(500),
});

export const reorderPinnedSchema = z.object({ position: z.number().int().min(0) });

export const issuePickerQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  periodStart: isoDateSchema,
});

export const activityPickerQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: id.optional(),
});
