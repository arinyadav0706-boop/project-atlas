import { timingSafeEqual } from "node:crypto";
import type {
  CodeEvent,
  CodeProviderAdapter,
  ParseInput,
  VerifyInput,
} from "@/features/code-integration/lib/provider";

// The GitLab adapter (ADR-0053). The only file in the module that knows GitLab
// exists, apart from the registry that names it.
//
// Payload shapes are GitLab's documented webhook bodies. They are typed loosely
// and read defensively on purpose: this is untrusted input from a system we do
// not control, and a self-managed instance may be several versions behind
// gitlab.com.

interface GitLabProject {
  path_with_namespace?: string;
  name?: string;
  web_url?: string;
}

interface GitLabCommit {
  id?: string;
  message?: string;
  url?: string;
  timestamp?: string;
  author?: { name?: string };
}

interface GitLabPayload {
  object_kind?: string;
  ref?: string;
  project?: GitLabProject;
  commits?: GitLabCommit[];
  user_name?: string;
  object_attributes?: {
    iid?: number;
    title?: string;
    description?: string;
    url?: string;
    source_branch?: string;
    state?: string;
    action?: string;
    updated_at?: string;
    created_at?: string;
    // Pipeline
    ref?: string;
    status?: string;
    id?: number;
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

function repositoryOf(payload: GitLabPayload, baseUrl: string) {
  const project = payload.project ?? {};
  return {
    name: str(project.path_with_namespace) ?? str(project.name) ?? "unknown",
    url: str(project.web_url) ?? baseUrl,
  };
}

export const GitLabAdapter: CodeProviderAdapter = {
  id: "GITLAB",

  webhookEventsToEnable: ["Push events", "Merge request events", "Pipeline events"],

  /**
   * GitLab sends the secret VERBATIM — there is no HMAC to recompute.
   *
   * Constant-time all the same: `===` on a secret leaks, through timing, how
   * many leading characters a guess got right, which is enough to walk it out
   * given enough requests.
   *
   * (GitLab's scheme is the weaker of the two we know about — the credential
   * travels on every request, so anything logging inbound headers logs it. That
   * is GitLab's design, not ours; the mitigation is a per-connection secret
   * that can be rotated on its own.)
   */
  verify({ headers, secret }: VerifyInput): boolean {
    const offered = headers.get("x-gitlab-token") ?? "";
    const a = Buffer.from(offered);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parse({ headers, rawBody, baseUrl }: ParseInput): CodeEvent | null {
    let payload: GitLabPayload;
    try {
      payload = JSON.parse(rawBody) as GitLabPayload;
    } catch {
      return null;
    }

    // `object_kind` in the body is authoritative; the header is a friendlier
    // label ("Push Hook") and is not always present behind proxies.
    const kind = str(payload.object_kind) ?? str(headers.get("x-gitlab-event") ?? undefined);
    const repository = repositoryOf(payload, baseUrl);

    if (kind === "push" || kind === "Push Hook") {
      const branch = branchFromRef(payload.ref);
      // A tag push or a branch deletion has no branch to link. Not an error.
      if (!branch) return null;
      const commits = (payload.commits ?? [])
        .filter((commit) => str(commit.id) && str(commit.message))
        .map((commit) => ({
          sha: commit.id!,
          message: commit.message!,
          url: str(commit.url) ?? `${repository.url}/-/commit/${commit.id}`,
          authorName: str(commit.author?.name) ?? str(payload.user_name),
          at: date(commit.timestamp),
        }));
      return {
        kind: "PUSH",
        repository,
        branch,
        branchUrl: `${repository.url}/-/tree/${encodeURIComponent(branch)}`,
        commits,
        at: commits.at(-1)?.at ?? new Date(),
      };
    }

    if (kind === "merge_request" || kind === "Merge Request Hook") {
      const mr = payload.object_attributes ?? {};
      if (mr.iid === undefined) return null;
      // GitLab's `state` is opened/merged/closed/locked. `locked` is a
      // transient state during merge; treating it as OPEN keeps the panel from
      // flickering into a state that means nothing to a reader.
      const raw = str(mr.state) ?? "opened";
      const state = raw === "merged" ? "MERGED" : raw === "closed" ? "CLOSED" : "OPEN";
      return {
        kind: "MERGE_REQUEST",
        repository,
        mergeRequest: {
          externalId: String(mr.iid),
          title: str(mr.title) ?? `Merge request !${mr.iid}`,
          description: str(mr.description) ?? null,
          url: str(mr.url) ?? `${repository.url}/-/merge_requests/${mr.iid}`,
          sourceBranch: str(mr.source_branch) ?? "",
          state,
          authorName: str(payload.user_name),
          at: date(mr.updated_at ?? mr.created_at),
        },
        at: date(mr.updated_at ?? mr.created_at),
      };
    }

    if (kind === "pipeline" || kind === "Pipeline Hook") {
      const pipeline = payload.object_attributes ?? {};
      const ref = str(pipeline.ref);
      const status = str(pipeline.status);
      if (!ref || !status) return null;
      return {
        kind: "PIPELINE",
        repository,
        ref,
        status,
        url: `${repository.url}/-/pipelines/${pipeline.id ?? ""}`,
        at: date(pipeline.updated_at ?? pipeline.created_at),
      };
    }

    // Note hooks, issue hooks, wiki hooks, releases… all real, none modelled.
    // Returning null is the documented "nothing to do", not a failure (BR-8).
    return null;
  },
};
