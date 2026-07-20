import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/07_sprint.md §Validation.

export const createSprintSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  goal: z.string().trim().max(2000).optional(),
});

// All fields optional (a partial edit); the endDate > startDate cross-field
// check lives in the service, where both the incoming and stored dates are known.
export const updateSprintSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

// Move an issue to a sprint (or back to the backlog when sprintId is null),
// positioned between two visible neighbours — one atomic sprintId + rank write
// (ADR-0014). Neighbour ids are validated server-side, never trusted.
export const moveIssueToSprintSchema = z.object({
  sprintId: z.string().nullable(),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
  // Optimistic concurrency (ADR-0011): the version the client dragged from.
  expectedVersion: z.number().int().min(0),
});

export type CreateSprintInput = z.infer<typeof createSprintSchema>;
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;
export type MoveIssueToSprintInput = z.infer<typeof moveIssueToSprintSchema>;
