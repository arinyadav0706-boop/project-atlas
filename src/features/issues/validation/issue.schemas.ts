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

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type TransitionIssueInput = z.infer<typeof transitionIssueSchema>;
