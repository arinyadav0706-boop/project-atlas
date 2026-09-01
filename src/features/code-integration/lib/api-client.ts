import type { CodeEvent, CodeProviderId } from "@/features/code-integration/lib/provider";

// Reading history from a git host (ADR-0054 §5).
//
// The single most important property, and the reason this returns `CodeEvent`
// rather than rows: **backfill writes links through the same `linkEvent` the
// webhook path uses.** A second writer is how the two drift, and then a
// backfilled merge request slowly stops looking like a webhooked one — a
// different title truncation here, a missing author there, a state that never
// updates. Normalising to the same union makes divergence impossible rather
// than merely discouraged.
//
// Note this is a THIRD interface per provider, beside the webhook adapter and
// the credential provider. Three small interfaces rather than one large one
// because they are used at different times by different callers: an inbound
// webhook needs only the adapter and must not drag an HTTP client into the
// request path.

/** A repository the install can see. */
export interface RepositoryRef {
  /** Provider-side id — survives a rename, unlike the path. */
  externalId: string;
  /** `owner/repo` or `group/project`. */
  path: string;
  defaultBranch: string | null;
  url: string;
}

/**
 * One page of results.
 *
 * `cursor` is whatever the provider needs to continue and is stored verbatim on
 * the run (35/BR-8). Deliberately opaque: reconstructing a page number would
 * break GitLab's keyset paging on large sets, and both providers already hand
 * back a next-link that encodes everything.
 */
export interface Page<T> {
  items: T[];
  cursor: string | null;
  /** True when the provider is nearly out of quota and we should stop politely. */
  shouldPause: boolean;
}

export interface WalkInput {
  baseUrl: string;
  accessToken: string;
  /** `owner/repo` — what the provider's URLs are built from. */
  repositoryPath: string;
  /** Nothing older than this (35/BR-9). */
  since: Date;
  /** From a previous `Page`. Null starts at the beginning. */
  cursor: string | null;
}

export interface CodeApiClient {
  id: CodeProviderId;

  /** Every repository this credential can see. Paged. */
  listRepositories(input: {
    baseUrl: string;
    accessToken: string;
    cursor: string | null;
  }): Promise<Page<RepositoryRef>>;

  /**
   * Merge/pull requests updated since the window start, as MERGE_REQUEST events.
   *
   * Ordered newest-first so an interrupted walk has already covered the part
   * anybody is looking at.
   */
  listMergeRequests(input: WalkInput): Promise<Page<CodeEvent>>;

  /**
   * Branches, as PUSH events with an **empty commit list**.
   *
   * Empty on purpose. `linkEvent` attributes the branch and each commit
   * separately (34/BR-2), so a branch whose name matches links the branch and
   * nothing else. Handing it the branch's commits here would resurrect exactly
   * the bug module 34 fixed: a branch match dragging in every unrelated commit
   * that happened to sit on it.
   *
   * A branch with no recent commits still needs a link, which is why this is
   * its own phase rather than a side effect of walking commits.
   */
  listBranches(input: WalkInput): Promise<Page<CodeEvent>>;

  /**
   * Commits on one branch since the window start, as PUSH events.
   *
   * The branch is carried on the event because that is what a real push looks
   * like, and `linkEvent` then does precisely what it does for a webhook —
   * links the branch if its name matches, and each commit only if its own
   * message does. Re-linking the branch on every page is an idempotent upsert
   * (34/BR-5), not a duplicate.
   *
   * Which branches get walked is the service's decision, not this client's.
   */
  listCommits(input: WalkInput & { branch: string }): Promise<Page<CodeEvent>>;
}
