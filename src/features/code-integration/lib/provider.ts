// The provider seam (ADR-0053 §1, §4). Pure: no Prisma, no IO.
//
// Everything downstream of an adapter sees only the types in this file. If the
// word "gitlab" appears anywhere except an adapter and the registry, the
// abstraction has leaked and the next provider is a rewrite rather than a file.

export const CODE_PROVIDERS = ["GITLAB", "GITHUB"] as const;
export type CodeProviderId = (typeof CODE_PROVIDERS)[number];

export interface CodeRepository {
  /** Human name, as the panel shows it: `team/service`. */
  name: string;
  url: string;
}

export interface CodeCommit {
  sha: string;
  message: string;
  url: string;
  authorName?: string;
  at: Date;
}

export interface CodeMergeRequest {
  /** Provider-side id — GitLab's `iid`, GitHub's PR number. */
  externalId: string;
  title: string;
  description?: string | null;
  url: string;
  sourceBranch: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  authorName?: string;
  at: Date;
}

/**
 * One normalised event.
 *
 * Three kinds, because three is what the panel needs: something was pushed,
 * a merge request changed, a pipeline finished. Providers emit far more; an
 * adapter returns `null` for everything else rather than inventing a kind.
 */
export type CodeEvent =
  | {
      kind: "PUSH";
      repository: CodeRepository;
      /** Branch short name — `feature/VWP-1`, never `refs/heads/feature/VWP-1`. */
      branch: string;
      branchUrl: string;
      commits: CodeCommit[];
      at: Date;
    }
  | {
      kind: "MERGE_REQUEST";
      repository: CodeRepository;
      mergeRequest: CodeMergeRequest;
      at: Date;
    }
  | {
      kind: "PIPELINE";
      repository: CodeRepository;
      /** The ref this pipeline ran on, so links for it can be updated. */
      ref: string;
      status: string;
      url: string;
      at: Date;
    };

export interface VerifyInput {
  headers: Headers;
  rawBody: string;
  secret: string;
}

export interface ParseInput {
  headers: Headers;
  rawBody: string;
  /** The connection's host, for building absolute URLs when a payload is relative. */
  baseUrl: string;
}

/**
 * A git host EAGLES can receive from.
 *
 * `verify` is on the interface, not shared, and that is the single most
 * important line in this file. The two providers we know about disagree at the
 * most basic level:
 *
 * - **GitLab** sends the configured secret VERBATIM in `X-Gitlab-Token`. You
 *   compare it, in constant time, to what you stored.
 * - **GitHub** sends `X-Hub-Signature-256`, an HMAC-SHA256 of the raw body keyed
 *   by the secret. Comparing that to the stored secret would never match.
 *
 * A design that shared one verifier and varied only parsing would have to be
 * torn open for the second provider — which is exactly what "make it agnostic"
 * is asking us to avoid.
 */
export interface CodeProviderAdapter {
  id: CodeProviderId;
  verify(input: VerifyInput): boolean;
  /**
   * Normalise, or `null` for an event kind this module does not model.
   *
   * Returning null is normal and not an error: providers send far more than
   * three kinds, and BR-8 means an unrecognised delivery is answered 200.
   */
  parse(input: ParseInput): CodeEvent | null;
}

/** Every text on an event that might name an issue (ADR-0053 §3). */
export function searchableText(event: CodeEvent): string[] {
  switch (event.kind) {
    case "PUSH":
      return [event.branch, ...event.commits.map((c) => c.message)];
    case "MERGE_REQUEST":
      return [
        event.mergeRequest.sourceBranch,
        event.mergeRequest.title,
        event.mergeRequest.description ?? "",
      ];
    case "PIPELINE":
      // A pipeline names nothing itself; it updates links that already exist
      // for its ref.
      return [event.ref];
  }
}
