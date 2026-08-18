import { z } from "zod";
import { issueFilterSchema } from "@/features/issues/validation/issue-filter.schemas";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/22_saved_views.md §7.

export const savedViewSort = z.enum([
  "UPDATED_DESC",
  "UPDATED_ASC",
  "CREATED_DESC",
  "CREATED_ASC",
  "DUE_DATE_ASC",
  "DUE_DATE_DESC",
  "PRIORITY_DESC",
  "PRIORITY_ASC",
  "KEY_ASC",
]);

export const savedViewVisibility = z.enum(["PRIVATE", "SHARED"]);

export const MAX_VIEW_NAME_LENGTH = 80;

// The filter is validated with the SAME schema the query string uses (BR-7), so
// a view can never hold a filter the ad-hoc list could not express.
export const createSavedViewSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(MAX_VIEW_NAME_LENGTH),
  filter: issueFilterSchema,
  sort: savedViewSort.default("UPDATED_DESC"),
  visibility: savedViewVisibility.default("PRIVATE"),
});

export const updateSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(MAX_VIEW_NAME_LENGTH).optional(),
  filter: issueFilterSchema.optional(),
  sort: savedViewSort.optional(),
  visibility: savedViewVisibility.optional(),
});

export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;

/**
 * Parse a filter that came out of the database (BR-8).
 *
 * A stored filter is JSON and Postgres cannot enforce its shape, so it is
 * re-validated on the way out. Anything that fails — a field removed in a later
 * release, hand-edited data, a partially-written row — yields the empty filter
 * and a flag, never a throw. A saved view that has rotted must still open, or
 * its owner has no way to repair it.
 *
 * Unknown keys are stripped rather than preserved: Zod objects are
 * strip-by-default, and that is deliberate here. Round-tripping a key the code
 * no longer understands would let a downgrade resurrect it.
 */
export function parseStoredFilter(value: unknown): {
  filter: z.infer<typeof issueFilterSchema>;
  corrupt: boolean;
} {
  const result = issueFilterSchema.safeParse(value);
  return result.success
    ? { filter: result.data, corrupt: false }
    : { filter: {}, corrupt: true };
}
