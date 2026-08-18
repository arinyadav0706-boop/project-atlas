import { z } from "zod";
import { issuePriority, issueStatus } from "@/features/issues/validation/issue.schemas";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/23_bulk_edit.md §7.

/** The page size. Selecting more than one page is not possible in the UI. */
export const MAX_BULK_ISSUES = 100;

/** Notifications per operation, before suppression (BR-13). */
export const MAX_BULK_NOTIFICATIONS = 25;

// `null` clears; an absent key leaves the field alone. `.nullable().optional()`
// is what distinguishes the two — `.nullish()` would read the same but loses
// the distinction at the call site when the object is spread.
const changesSchema = z
  .object({
    status: issueStatus.optional(),
    priority: issuePriority.optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
    sprintId: z.string().trim().min(1).nullable().optional(),
  })
  // An empty change set is a mistake, not a no-op (BR-2). Catching it here
  // means the service never has to reason about a request that does nothing.
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: "Choose at least one field to change.",
  });

export const bulkEditSchema = z.object({
  issueIds: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one issue.")
    .max(MAX_BULK_ISSUES, `You can change at most ${MAX_BULK_ISSUES} issues at once.`)
    // De-duplicated so a repeated id cannot be written twice and counted twice.
    .transform((ids) => [...new Set(ids)]),
  changes: changesSchema,
});

export type BulkEditInput = z.infer<typeof bulkEditSchema>;
export type BulkEditChanges = z.infer<typeof changesSchema>;
