import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// Serialises an `IssueFilter` back into the query string the routes parse
// (`parseIssueFilter`). Kept beside the filter so the writer and the reader of
// the same wire format live together — a client that spells `labelIds`
// differently from the server is a bug that only shows up at runtime.
//
// Array fields are emitted as repeated params, which is what `getAll` reads.
export function issueFilterToQuery(filter: IssueFilter): URLSearchParams {
  const q = new URLSearchParams();
  if (filter.sprintId) q.set("sprintId", filter.sprintId);
  if (filter.epicId) q.set("epicId", filter.epicId);
  if (filter.assigneeId) q.set("assigneeId", filter.assigneeId);
  if (filter.type) q.set("type", filter.type);
  if (filter.priority) q.set("priority", filter.priority);
  if (filter.search) q.set("search", filter.search);
  for (const id of filter.labelIds ?? []) q.append("labelIds", id);
  for (const id of filter.componentIds ?? []) q.append("componentIds", id);
  return q;
}

/** True when the filter narrows anything — mirrors the server-side predicate. */
export function isIssueFilterActive(filter: IssueFilter): boolean {
  return [...issueFilterToQuery(filter).keys()].length > 0;
}
