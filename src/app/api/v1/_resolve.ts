import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Shared by every `/issues/{issueRef}` route.
//
// An issue is addressable by **id or key** (`VWP-1301`), because the key is
// what appears in a Slack message, a commit and a support ticket. An API that
// only accepts cuids makes every caller do a lookup first.

/** Anything shaped like `ABC-123`. Otherwise treated as an id. */
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

export async function resolveIssueId(actor: Actor, ref: string): Promise<string> {
  const value = decodeURIComponent(ref).trim();
  if (!KEY_PATTERN.test(value)) return value;
  // Org-scoped: keys are unique per project, and two organizations may both
  // have a project keyed OPS (F-1).
  const row = await IssueRepository.findIdByKey(actor.organizationId, value);
  if (!row) throw new NotFoundError("Issue not found.");
  return row.id;
}
