import type {
  CodeApiClient,
  Page,
  RepositoryRef,
  WalkInput,
} from "@/features/code-integration/lib/api-client";
import { nearlyOutOfQuota, nextLink, providerFetch } from "@/features/code-integration/lib/http";
import type { CodeEvent } from "@/features/code-integration/lib/provider";

// Reading history from GitLab (ADR-0054 §5).
//
// Same contract as the GitHub client, and the differences are all in here:
// GitLab addresses projects by a URL-encoded path, filters merge requests with
// `updated_after` rather than sorting and stopping, and puts `/-/` in its web
// URLs where GitHub does not.

const PER_PAGE = 100;

function api(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v4`;
}

/** GitLab identifies a project by `group%2Fproject`, slashes and all. */
function projectId(path: string): string {
  return encodeURIComponent(path);
}

async function page<T>(
  url: string,
  accessToken: string,
): Promise<{ body: T; cursor: string | null; shouldPause: boolean }> {
  const response = await providerFetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  return {
    body: (await response.json()) as T,
    cursor: nextLink(response),
    shouldPause: nearlyOutOfQuota(response),
  };
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const at = (value: unknown): Date => {
  const parsed = typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

interface GlProject {
  id?: number;
  path_with_namespace?: string;
  default_branch?: string;
  web_url?: string;
}

interface GlMergeRequest {
  iid?: number;
  title?: string;
  description?: string | null;
  web_url?: string;
  source_branch?: string;
  state?: string;
  author?: { username?: string; name?: string };
  updated_at?: string;
  created_at?: string;
}

interface GlBranch {
  name?: string;
  web_url?: string;
}

interface GlCommit {
  id?: string;
  message?: string;
  title?: string;
  web_url?: string;
  author_name?: string;
  created_at?: string;
  committed_date?: string;
}

function repositoryOf(baseUrl: string, path: string) {
  return { name: path, url: `${baseUrl.replace(/\/+$/, "")}/${path}` };
}

export const GitLabApiClient: CodeApiClient = {
  id: "GITLAB",

  async listRepositories({ baseUrl, accessToken, cursor }): Promise<Page<RepositoryRef>> {
    // `membership=true` rather than every project on the instance: the OAuth
    // token carries a user's reach, and listing 40,000 public projects would be
    // a repository picker nobody can use.
    const url =
      cursor ??
      `${api(baseUrl)}/projects?membership=true&simple=true&order_by=last_activity_at` +
        `&per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GlProject[]>(url, accessToken);
    return {
      items: body
        .filter((project) => str(project.path_with_namespace))
        .map((project) => ({
          externalId: String(project.id ?? project.path_with_namespace),
          path: project.path_with_namespace!,
          defaultBranch: str(project.default_branch) ?? null,
          url: str(project.web_url) ?? `${baseUrl}/${project.path_with_namespace}`,
        })),
      cursor: next,
      shouldPause,
    };
  },

  async listMergeRequests({
    baseUrl,
    accessToken,
    repositoryPath,
    since,
    cursor,
  }: WalkInput): Promise<Page<CodeEvent>> {
    // GitLab filters server-side, so unlike GitHub there is no "stop at the
    // first one out of range" — the window is the query.
    const url =
      cursor ??
      `${api(baseUrl)}/projects/${projectId(repositoryPath)}/merge_requests` +
        `?state=all&updated_after=${since.toISOString()}&order_by=updated_at&sort=desc` +
        `&per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GlMergeRequest[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);

    const items: CodeEvent[] = body
      .filter((mr) => mr.iid !== undefined)
      .map((mr) => {
        const when = at(mr.updated_at ?? mr.created_at);
        const state = str(mr.state) ?? "opened";
        return {
          kind: "MERGE_REQUEST" as const,
          repository,
          mergeRequest: {
            externalId: String(mr.iid),
            title: str(mr.title) ?? `Merge request !${mr.iid}`,
            description: str(mr.description ?? undefined) ?? null,
            url: str(mr.web_url) ?? `${repository.url}/-/merge_requests/${mr.iid}`,
            sourceBranch: str(mr.source_branch) ?? "",
            // Same mapping as the webhook adapter, including `locked` → OPEN.
            state: state === "merged" ? "MERGED" : state === "closed" ? "CLOSED" : "OPEN",
            authorName: str(mr.author?.username) ?? str(mr.author?.name),
            at: when,
          },
          at: when,
        };
      });
    return { items, cursor: next, shouldPause };
  },

  async listBranches({
    baseUrl,
    accessToken,
    repositoryPath,
    cursor,
  }: WalkInput): Promise<Page<CodeEvent>> {
    const url =
      cursor ??
      `${api(baseUrl)}/projects/${projectId(repositoryPath)}/repository/branches` +
        `?per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GlBranch[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);
    return {
      items: body
        .filter((branch) => str(branch.name))
        .map((branch) => ({
          kind: "PUSH" as const,
          repository,
          branch: branch.name!,
          branchUrl:
            str(branch.web_url) ??
            `${repository.url}/-/tree/${encodeURIComponent(branch.name!)}`,
          // Empty on purpose (34/BR-2) — see the interface.
          commits: [],
          at: new Date(),
        })),
      cursor: next,
      shouldPause,
    };
  },

  async listCommits({
    baseUrl,
    accessToken,
    repositoryPath,
    since,
    cursor,
    branch,
  }): Promise<Page<CodeEvent>> {
    const url =
      cursor ??
      `${api(baseUrl)}/projects/${projectId(repositoryPath)}/repository/commits` +
        `?ref_name=${encodeURIComponent(branch)}&since=${since.toISOString()}` +
        `&per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GlCommit[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);

    const commits = body
      .filter((commit) => str(commit.id) && (str(commit.message) ?? str(commit.title)))
      .map((commit) => ({
        sha: commit.id!,
        // `message` is the full text and `title` only the first line. The full
        // text is what gets searched for keys, so a key mentioned in a commit
        // body is found — the same as the webhook path.
        message: (str(commit.message) ?? str(commit.title))!,
        url: str(commit.web_url) ?? `${repository.url}/-/commit/${commit.id}`,
        authorName: str(commit.author_name),
        at: at(commit.committed_date ?? commit.created_at),
      }));

    const items: CodeEvent[] =
      commits.length === 0
        ? []
        : [
            {
              kind: "PUSH",
              repository,
              branch,
              branchUrl: `${repository.url}/-/tree/${encodeURIComponent(branch)}`,
              commits,
              at: commits[0]!.at,
            },
          ];
    return { items, cursor: next, shouldPause };
  },
};
