import { z } from "zod";
import {
  issuePriority,
  issueStatus,
  issueType,
} from "@/features/issues/validation/issue.schemas";
import { MAX_ISSUE_SEARCH_LENGTH } from "@/features/issues/types/issue-filter.types";
import { decodePredicate } from "@/features/custom-fields/lib/field-predicate";

/** Bounded: each predicate is an EAV join, so this caps the joins per query. */
export const MAX_CUSTOM_FIELD_PREDICATES = 10;

const customFieldPredicate = z.object({
  fieldId: z.string().trim().min(1),
  op: z.enum(["eq", "contains", "gt", "lt", "any_of", "is_empty", "is_not_empty"]),
  value: z.union([z.string(), z.array(z.string())]).optional(),
});

// One parser for the composable issue filter (ADR-0008), shared by every list
// route. Empty/omitted fields drop out so the filter only ever carries active
// constraints. `labelIds`/`componentIds` arrive as repeated query params.
//
// Promoted out of the Board because Backlog now parses the same thing: two
// hand-written parsers would eventually disagree about, say, whether a blank
// `search=` means "no filter" or "match empty".
export const issueFilterSchema = z.object({
  // Bounded: a filter must never become an unbounded IN list.
  projectIds: z.array(z.string().trim().min(1)).max(50).optional(),
  status: issueStatus.optional(),
  openOnly: z.boolean().optional(),
  hasEstimate: z.boolean().optional(),
  sprintId: z.string().trim().min(1).optional(),
  epicId: z.string().trim().min(1).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  type: issueType.optional(),
  // Subtask participation (ADR-0045 §6). Absent = include them.
  subtask: z.enum(["only", "exclude"]).optional(),
  // Has an OPEN blocker (ADR-0046 §7). Tri-state, like hasEstimate.
  blocked: z.boolean().optional(),
  priority: issuePriority.optional(),
  labelIds: z.array(z.string().trim().min(1)).optional(),
  componentIds: z.array(z.string().trim().min(1)).optional(),
  // `.trim().min(1)` is what makes `?search=` (blank) drop out rather than
  // filter every title against the empty string.
  search: z.string().trim().min(1).max(MAX_ISSUE_SEARCH_LENGTH).optional(),
  customFields: z.array(customFieldPredicate).max(MAX_CUSTOM_FIELD_PREDICATES).optional(),
});

export type IssueFilterInput = z.infer<typeof issueFilterSchema>;

/** Reads a filter straight off a route's `searchParams`. */
export function parseIssueFilter(q: URLSearchParams): IssueFilterInput {
  const labelIds = q.getAll("labelIds");
  const componentIds = q.getAll("componentIds");
  const projectIds = q.getAll("projectIds");
  // Only the two literal strings count. An absent param and a malformed one
  // both mean "no constraint" — `hasEstimate=maybe` must not silently become
  // `false` and hide every estimated issue.
  const hasEstimate = q.get("hasEstimate");
  const blocked = q.get("blocked");
  return issueFilterSchema.parse({
    blocked: blocked === "true" ? true : blocked === "false" ? false : undefined,
    projectIds: projectIds.length ? projectIds : undefined,
    status: q.get("status") ?? undefined,
    openOnly: q.get("openOnly") === "true" ? true : undefined,
    hasEstimate:
      hasEstimate === "true" ? true : hasEstimate === "false" ? false : undefined,
    sprintId: q.get("sprintId") ?? undefined,
    epicId: q.get("epicId") ?? undefined,
    assigneeId: q.get("assigneeId") ?? undefined,
    type: q.get("type") ?? undefined,
    // Like `hasEstimate`, only the literal values count — `subtask=yes` is a
    // malformed param and must mean "no constraint", not silently pick one.
    subtask: (() => {
      const v = q.get("subtask");
      return v === "only" || v === "exclude" ? v : undefined;
    })(),
    priority: q.get("priority") ?? undefined,
    labelIds: labelIds.length ? labelIds : undefined,
    componentIds: componentIds.length ? componentIds : undefined,
    search: q.get("search") ?? undefined,
    // `?cf=fieldId:op:value`, repeated. A malformed one is dropped rather than
    // rejecting the whole request — a stale link should open unfiltered, not
    // 422 (ADR-0043 §2).
    customFields: (() => {
      const parsed = q
        .getAll("cf")
        .map(decodePredicate)
        .filter((p): p is NonNullable<typeof p> => p !== null);
      return parsed.length ? parsed : undefined;
    })(),
  });
}
