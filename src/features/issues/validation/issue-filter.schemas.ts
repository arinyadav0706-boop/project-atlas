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

/**
 * Reads a filter straight off a route's `searchParams`.
 *
 * The result carries only the keys that are actually constrained. Zod keeps a
 * key whose value parsed to `undefined`, so an empty query used to come back as
 * fifteen keys all set to undefined — semantically empty, but
 * `Object.keys(filter).length` said fifteen. Both the Timeline and the Calendar
 * decide their "open work by default" from exactly that check, so the default
 * silently never fired and both views opened on the archive. Stripping here
 * fixes it once, for every caller, rather than teaching each page to ask the
 * question a different way.
 */
export function parseIssueFilter(q: URLSearchParams): IssueFilterInput {
  const labelIds = q.getAll("labelIds");
  const componentIds = q.getAll("componentIds");
  const projectIds = q.getAll("projectIds");
  // Only the two literal strings count. An absent param and a malformed one
  // both mean "no constraint" — `hasEstimate=maybe` must not silently become
  // `false` and hide every estimated issue.
  const hasEstimate = q.get("hasEstimate");
  const blocked = q.get("blocked");
  /**
   * An empty param is no constraint at all.
   *
   * `q.get()` returns `""` for `?search=`, and `"" ?? undefined` is `""` — which
   * then fails `.min(1)` and 422s the whole request. So `/issues?search=`, a URL
   * any cleared search box or hand-edited link produces, returned an error page
   * rather than an unfiltered list. Same for `?status=` against the enum. A
   * stale link should open unfiltered (ADR-0043 §2).
   */
  const set = (key: string): string | undefined => q.get(key)?.trim() || undefined;
  return dropUndefined(
    issueFilterSchema.parse({
      blocked: blocked === "true" ? true : blocked === "false" ? false : undefined,
      projectIds: projectIds.length ? projectIds : undefined,
      status: set("status"),
      openOnly: q.get("openOnly") === "true" ? true : undefined,
      hasEstimate:
        hasEstimate === "true" ? true : hasEstimate === "false" ? false : undefined,
      sprintId: set("sprintId"),
      epicId: set("epicId"),
      assigneeId: set("assigneeId"),
      type: set("type"),
      // Like `hasEstimate`, only the literal values count — `subtask=yes` is a
      // malformed param and must mean "no constraint", not silently pick one.
      subtask: (() => {
        const v = q.get("subtask");
        return v === "only" || v === "exclude" ? v : undefined;
      })(),
      priority: set("priority"),
      labelIds: labelIds.length ? labelIds : undefined,
      componentIds: componentIds.length ? componentIds : undefined,
      search: set("search"),
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
    }),
  );
}

/**
 * Drop keys whose value is `undefined`.
 *
 * A key set to undefined and an absent key mean the same thing to every
 * consumer of this filter — but only one of them is invisible to
 * `Object.keys()`, and that difference is what broke the default above.
 */
function dropUndefined(filter: IssueFilterInput): IssueFilterInput {
  return Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== undefined),
  ) as IssueFilterInput;
}
