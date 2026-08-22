import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/04_issues.md §Validation.

export const issueType = z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]);

/**
 * The types a blank create form may choose (ADR-0045 §1).
 *
 * `SUBTASK` is excluded: it cannot exist without a parent, so it is created
 * through `POST /api/issues/{id}/subtasks` and never from nothing. Refusing it
 * here means a client cannot conjure the orphan the CHECK constraint forbids.
 */
export const standaloneIssueType = z.enum(["EPIC", "STORY", "TASK", "BUG"]);
export const issueStatus = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
export const issuePriority = z.enum(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]);

export const createIssueSchema = z.object({
  type: standaloneIssueType,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(20000).optional(),
  priority: issuePriority.default("MEDIUM"),
  assigneeId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // Optional effort estimate in minutes (time tracking, ADR-0030). Server-side
  // this is LEAD-only — a non-lead who sends it is rejected (BR-5).
  estimateMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  // Custom field values, keyed by field id (ADR-0042). The value shapes cannot
  // be checked here — they depend on each field's declared type — so this only
  // carries them through to CustomFieldService, which validates against the
  // definitions. Required fields are enforced at creation only (BR-11).
  customFields: z.record(z.string().trim().min(1), z.unknown()).optional(),
});

// Optimistic concurrency (ADR-0011): the card version the client is editing
// from. The write applies only if the issue is still at that version, else 409.
const expectedVersion = z.number().int().min(0);

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  // `SUBTASK` is a legal target here, unlike on create — this is the
  // subtask→issue and issue→subtask conversion path (BR-10), and the service
  // pairs it with `parentId` so the two can never disagree.
  type: issueType.optional(),
  priority: issuePriority.optional(),
  assigneeId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  /**
   * Convert (ADR-0045 §10). A parent id makes this issue a subtask of it;
   * `null` promotes a subtask back to a standalone `TASK`. Absent leaves the
   * hierarchy alone — which is why it is optional AND nullable, and why the
   * service tests `!== undefined` rather than truthiness.
   */
  parentId: z.string().trim().min(1).nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  expectedVersion,
});

/**
 * Create a subtask under a parent (BR-12).
 *
 * The create schema minus the three fields a subtask cannot have: `type` (it is
 * always `SUBTASK`), `epicId` (it reaches its epic through the parent, BR-3)
 * and `storyPoints` (refused outright, BR-6). Absent rather than accepted and
 * ignored — a client that sends points should learn, not be silently overruled.
 */
export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(20000).optional(),
  priority: issuePriority.default("MEDIUM"),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimateMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  customFields: z.record(z.string().trim().min(1), z.unknown()).optional(),
});

/** BR-9 — beyond this a "breakdown" is a project, and the parent page stops
 *  being readable. */
export const MAX_SUBTASKS_PER_PARENT = 50;

// A status is a per-project row now, not one of four fixed values
// (30_workflow BR-1), so a transition names an id. The service checks it
// belongs to the issue's project — an id from another project is a 404.
export const transitionIssueSchema = z.object({
  statusId: z.string().trim().min(1, "Choose a status."),
  expectedVersion,
});

// Board/Backlog reorder (ADR-0009). The card is placed between two visible
// neighbours (either may be null for a column end); an optional `status`
// combines a column move with the reorder in one call. Neighbour ids are
// validated server-side — never trusted from the client.
export const reorderIssueSchema = z.object({
  // Which view's neighbours to validate against (ADR-0013). Defaults to board,
  // so existing board callers are unaffected.
  scope: z.enum(["board", "backlog"]).default("board"),
  /** The destination COLUMN, which is a status id (30_workflow BR-5). */
  statusId: z.string().trim().min(1).optional(),
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
  // Group-by-epic backlog drop (ADR-0026): reassign the parent epic in the same
  // move. Only honoured for scope=backlog; null clears the parent ("No epic").
  epicId: z.string().nullable().optional(),
  expectedVersion,
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type TransitionIssueInput = z.infer<typeof transitionIssueSchema>;
// Input-side type: `scope` carries a default, so callers (and the Board, which
// predates scoping) may omit it — the service treats a missing scope as "board"
// (ADR-0013). The route always parses first, producing a value with scope set.
export type ReorderIssueInput = z.input<typeof reorderIssueSchema>;
