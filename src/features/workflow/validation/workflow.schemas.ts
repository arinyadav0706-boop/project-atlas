import { z } from "zod";
import { STATUS_COLORS } from "@/features/workflow/lib/defaults";
import { STATUS_CATEGORIES } from "@/features/workflow/types/workflow.types";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/30_workflow.md §7.

/**
 * Beyond this a board is a horizontal scrollbar with columns nobody reads.
 * ClickUp warns past about a dozen; Jira has no limit and Jira boards with
 * thirty columns are a known support burden.
 */
export const MAX_STATUSES_PER_PROJECT = 20;

export const statusCategory = z.enum(STATUS_CATEGORIES);
export const statusColor = z.enum(STATUS_COLORS);

/** Trimmed, because " Done" and "Done" are the same status to a human. */
const statusName = z
  .string()
  .trim()
  .min(1, "Give the status a name.")
  .max(40, "Keep a status name under 40 characters.");

export const createStatusSchema = z
  .object({
    name: statusName,
    category: statusCategory,
    color: statusColor,
  })
  .strict();

export const updateStatusSchema = z
  .object({
    name: statusName.optional(),
    category: statusCategory.optional(),
    color: statusColor.optional(),
    /** Only `true` is meaningful: a project always has exactly one default. */
    isDefault: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change." });

export const deleteStatusSchema = z
  .object({
    /**
     * Required, always (BR-6). A status with issues on it cannot simply vanish,
     * and asking at the point of deletion is the only moment the person knows
     * where those issues should go.
     */
    replacementId: z.string().trim().min(1, "Choose where its issues should go."),
  })
  .strict();

export const reorderStatusesSchema = z
  .object({
    /**
     * The COMPLETE ordered list (BR-8). Sending only the moved id invites two
     * clients to interleave into an order neither of them chose.
     */
    statusIds: z.array(z.string().trim().min(1)).min(1).max(MAX_STATUSES_PER_PROJECT),
  })
  .strict();

export const transitionsSchema = z
  .object({
    enforce: z.boolean(),
    transitions: z
      .array(
        z
          .object({
            fromStatusId: z.string().trim().min(1),
            toStatusId: z.string().trim().min(1),
          })
          .strict(),
      )
      // n statuses have at most n×(n−1) ordered pairs; the cap bounds the write.
      .max(MAX_STATUSES_PER_PROJECT * MAX_STATUSES_PER_PROJECT),
  })
  .strict()
  .refine((v) => v.transitions.every((t) => t.fromStatusId !== t.toStatusId), {
    message: "A status can always stay where it is; don't list it as a transition.",
    path: ["transitions"],
  });

export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type DeleteStatusInput = z.infer<typeof deleteStatusSchema>;
export type ReorderStatusesInput = z.infer<typeof reorderStatusesSchema>;
export type TransitionsInput = z.infer<typeof transitionsSchema>;
