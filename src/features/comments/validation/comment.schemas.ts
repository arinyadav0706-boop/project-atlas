import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/08_comments.md §Validation.

const body = z.string().trim().min(1, "Comment can't be empty").max(10000);

export const createCommentSchema = z.object({
  body,
  // Threading backbone (ADR-0016); accepted now, flat in the MVP UI.
  parentCommentId: z.string().nullable().optional(),
});

export const updateCommentSchema = z.object({
  body,
  // Optimistic concurrency (ADR-0011): the version the client is editing from.
  expectedVersion: z.number().int().min(0),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
