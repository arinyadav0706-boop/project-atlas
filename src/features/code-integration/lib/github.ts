import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CodeEvent,
  CodeProviderAdapter,
  ParseInput,
  VerifyInput,
} from "@/features/code-integration/lib/provider";

// The GitHub adapter (ADR-0053 §9). The second implementation of the seam, and
// the one that tests whether §1's claim was true.
//
// Payload shapes are GitHub's documented webhook bodies, typed loosely and read
// defensively: this is untrusted input, and GitHub Enterprise Server trails
// github.com by a release or three.

interface GitHubRepository {
  full_name?: string;
  name?: string;
  html_url?: string;
}

interface GitHubCommit {
  id?: string;
  message?: string;
  url?: string;
  timestamp?: string;
  author?: { name?: string; username?: string };
}

interface GitHubPayload {
  ref?: string;
  deleted?: boolean;
  created?: boolean;
  repository?: GitHubRepository;
  commits?: GitHubCommit[];
  head_commit?: GitHubCommit | null;
  pusher?: { name?: string };
  sender?: { login?: string };
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string;
    state?: string;
    merged?: boolean;
    merged_at?: string | null;
    head?: { ref?: string };
    user?: { login?: string };
    updated_at?: string;
    created_at?: string;
  };
  check_suite?: {
    head_branch?: string | null;
    head_sha?: string;
    status?: string;
    conclusion?: string | null;
    updated_at?: string;
    created_at?: string;
  };
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const date = (value: unknown): Date => {
  const parsed = typeof value === "string" ? new Date(value) : new Date(NaN);
  // A malformed timestamp must not make the whole delivery unparseable — the
  // event still happened, and "now" is a better answer than dropping it.
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/** `refs/heads/feature/x` → `feature/x`. Tags and other refs are not branches. */
function branchFromRef(ref: string | undefined): string | null {
  if (!ref) return null;
  if (!ref.startsWith("refs/heads/")) return null;
  const branch = ref.slice("refs/heads/".length);
  return branch.length > 0 ? branch : null;
}

/**
 * GitHub keeps the slashes in a branch path, so each segment is encoded on its
 * own — `.../tree/feature/VWP-1`, not `.../tree/feature%2FVWP-1`.
 */
function branchPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

/**
 * GitHub's webhook form defaults its content type to
 * `application/x-www-form-urlencoded`, which sends the JSON as a single
 * `payload=` field rather than as the body.
 *
 * Left unhandled, the default setting produces an integration that verifies
 * fine — GitHub signs whatever bytes it sent — and then silently links nothing
 * forever, which is the worst failure this module can have: no error anywhere,
 * and the admin screen showing events arriving. The setup screen asks for
 * `application/json`; this is what happens when somebody does not read it.
 */
function bodyJson(rawBody: string): string {
  if (!rawBody.startsWith("payload=")) return rawBody;
  return decodeURIComponent(rawBody.slice("payload=".length).replace(/\+/g, " "));
}

function repositoryOf(payload: GitHubPayload, baseUrl: string) {
  const repository = payload.repository ?? {};
  return {
    name: str(repository.full_name) ?? str(repository.name) ?? "unknown",
    url: str(repository.html_url) ?? baseUrl,
  };
}

export const GitHubAdapter: CodeProviderAdapter = {
  id: "GITHUB",

  /**
   * GitHub signs the raw body: `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256
   * keyed by the shared secret.
   *
   * Three things this deliberately does NOT do:
   *
   * - **Accept `X-Hub-Signature`** (the legacy SHA-1 header GitHub still sends
   *   alongside). Honouring it would let anyone who can reach this endpoint
   *   choose the weaker digest — a downgrade attack we would have opted into
   *   for the sake of GitHub Enterprise versions old enough to be unsupported.
   * - **Re-serialise the body.** The signature covers the exact bytes GitHub
   *   sent; `JSON.parse` → `JSON.stringify` changes key order and whitespace and
   *   would never match (BR-15). The endpoint reads text once and passes the
   *   same string here and to `parse`.
   * - **Compare with `===`.** String equality on a digest leaks, through timing,
   *   how many leading bytes a guess got right.
   */
  verify({ headers, rawBody, secret }: VerifyInput): boolean {
    const offered = headers.get("x-hub-signature-256");
    if (!offered || !offered.startsWith("sha256=")) return false;

    const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
    const a = Buffer.from(offered);
    const b = Buffer.from(expected);
    // Lengths differ only for a malformed header, and timingSafeEqual throws on
    // a mismatch, so this guard is required rather than an optimisation.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parse({ headers, rawBody, baseUrl }: ParseInput): CodeEvent | null {
    let payload: GitHubPayload;
    try {
      payload = JSON.parse(bodyJson(rawBody)) as GitHubPayload;
    } catch {
      return null;
    }

    // Unlike GitLab, the body carries no event name at all — `X-GitHub-Event`
    // is the only source. A proxy that strips it makes every delivery
    // unparseable, which BR-8 turns into a quiet 200 rather than an error
    // (ADR-0053 §9).
    const kind = str(headers.get("x-github-event") ?? undefined);
    const repository = repositoryOf(payload, baseUrl);

    if (kind === "push") {
      // A branch deletion arrives as a push with `deleted: true` and no
      // commits. Nothing to link, and certainly nothing to create.
      if (payload.deleted === true) return null;
      const branch = branchFromRef(payload.ref);
      // A tag push has a ref but not a branch one. Not an error.
      if (!branch) return null;
      const commits = (payload.commits ?? [])
        .filter((commit) => str(commit.id) && str(commit.message))
        .map((commit) => ({
          sha: commit.id!,
          message: commit.message!,
          url: str(commit.url) ?? `${repository.url}/commit/${commit.id}`,
          // `author.name` is the git author from the commit itself;
          // `pusher.name` is the account that pushed it. Prefer the author,
          // because that is whose name belongs beside their commit.
          authorName: str(commit.author?.name) ?? str(payload.pusher?.name),
          at: date(commit.timestamp),
        }));
      return {
        kind: "PUSH",
        repository,
        branch,
        branchUrl: `${repository.url}/tree/${branchPath(branch)}`,
        commits,
        at: commits.at(-1)?.at ?? new Date(),
      };
    }

    if (kind === "pull_request") {
      const pr = payload.pull_request ?? {};
      if (pr.number === undefined) return null;
      return {
        kind: "MERGE_REQUEST",
        repository,
        mergeRequest: {
          externalId: String(pr.number),
          title: str(pr.title) ?? `Pull request #${pr.number}`,
          description: str(pr.body ?? undefined) ?? null,
          url: str(pr.html_url) ?? `${repository.url}/pull/${pr.number}`,
          sourceBranch: str(pr.head?.ref) ?? "",
          // BR-14, and the difference that would have shipped a silent bug.
          // GitHub has no merged state: a merged PR is `state: "closed"` with
          // `merged: true`. Reading `state` alone would show every merged pull
          // request as Closed and would never fire the on-merge transition —
          // wrong only in the one case anybody cares about.
          state: pr.merged === true ? "MERGED" : str(pr.state) === "closed" ? "CLOSED" : "OPEN",
          authorName: str(pr.user?.login),
          at: date(pr.updated_at ?? pr.created_at),
        },
        at: date(pr.updated_at ?? pr.created_at),
      };
    }

    if (kind === "check_suite") {
      const suite = payload.check_suite ?? {};
      const ref = str(suite.head_branch ?? undefined);
      if (!ref) return null;
      // GitHub splits what GitLab calls one thing: `status` is progress
      // (queued/in_progress/completed) and `conclusion` is the outcome
      // (success/failure/…), and `conclusion` is null until it finishes. Report
      // the outcome once there is one, otherwise the progress — so the chip
      // reads "in_progress" then "success" rather than "completed", which says
      // nothing about whether the build passed.
      const status = str(suite.conclusion ?? undefined) ?? str(suite.status);
      if (!status) return null;
      return {
        kind: "PIPELINE",
        repository,
        ref,
        status,
        // A check suite has no page of its own; the commit's checks tab is
        // where a human actually wants to land.
        url: `${repository.url}/commits/${str(suite.head_sha) ?? ""}/checks`,
        at: date(suite.updated_at ?? suite.created_at),
      };
    }

    // `ping` on hook creation, plus issues, releases, stars, workflow_job… all
    // real, none modelled. Returning null is the documented "nothing to do",
    // not a failure (BR-8). A `ping` still updates `lastEventAt`, which is what
    // makes the admin screen say the hook is wired.
    return null;
  },
};
