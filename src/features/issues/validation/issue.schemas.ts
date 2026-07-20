import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/04_issues.md §Validation.

export const issueType = z.enum(["EPIC", "STORY", "TASK", "BUG"]);
export const issueStatus = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
export const issuePriority = z.enum(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]);

export const createIssueSchema = z.object({
  type: issueType,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(20000).optional(),
  priority: issuePriority.default("MEDIUM"),
  assigneeId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  type: issueType.optional(),
  priority: issuePriority.optional(),
  assigneeId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const transitionIssueSchema = z.object({
  status: issueStatus,
});

// Board/Backlog reorder (ADR-0009). The card is placed between two visible
// neighbours (either may be null for a column end); an optional `status`
// combines a column move with the reorder in one call. Neighbour ids are
// validated server-side — never trusted from the client.
export const reorderIssueSchema = z.object({
  status: issueStatus.optional(),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
  // Optimistic concurrency (ADR-0011): the card version the client based this
  // move on. The move applies only if the card is still at that version.
  expectedVersion: z.number().int().min(0),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type TransitionIssueInput = z.infer<typeof transitionIssueSchema>;
export type ReorderIssueInput = z.infer<typeof reorderIssueSchema>;
