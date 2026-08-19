import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { encodePredicate } from "@/features/custom-fields/lib/field-predicate";

// Serialises an `IssueFilter` back into the query string the routes parse
// (`parseIssueFilter`). Kept beside the filter so the writer and the reader of
// the same wire format live together — a client that spells `labelIds`
// differently from the server is a bug that only shows up at runtime.
//
// Array fields are emitted as repeated params, which is what `getAll` reads.
export function issueFilterToQuery(filter: IssueFilter): URLSearchParams {
  const q = new URLSearchParams();
  // Written as the literal strings the parser recognises; `false` is a real
  // constraint here ("unestimated"), so this cannot be a truthiness check.
  if (filter.hasEstimate !== undefined) q.set("hasEstimate", String(filter.hasEstimate));
  if (filter.status) q.set("status", filter.status);
  else if (filter.openOnly) q.set("openOnly", "true");
  for (const id of filter.projectIds ?? []) q.append("projectIds", id);
  if (filter.sprintId) q.set("sprintId", filter.sprintId);
  if (filter.epicId) q.set("epicId", filter.epicId);
  if (filter.assigneeId) q.set("assigneeId", filter.assigneeId);
  if (filter.type) q.set("type", filter.type);
  if (filter.subtask) q.set("subtask", filter.subtask);
  // `false` is a real constraint here ("nothing is in its way"), so this cannot
  // be a truthiness check.
  if (filter.blocked !== undefined) q.set("blocked", String(filter.blocked));
  if (filter.priority) q.set("priority", filter.priority);
  if (filter.search) q.set("search", filter.search);
  for (const id of filter.labelIds ?? []) q.append("labelIds", id);
  for (const id of filter.componentIds ?? []) q.append("componentIds", id);
  for (const p of filter.customFields ?? []) q.append("cf", encodePredicate(p));
  return q;
}

/** True when the filter narrows anything — mirrors the server-side predicate. */
export function isIssueFilterActive(filter: IssueFilter): boolean {
  return [...issueFilterToQuery(filter).keys()].length > 0;
}
