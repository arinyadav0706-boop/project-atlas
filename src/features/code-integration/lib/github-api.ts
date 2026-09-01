import type {
  CodeApiClient,
  Page,
  RepositoryRef,
  WalkInput,
} from "@/features/code-integration/lib/api-client";
import { apiRoot } from "@/features/code-integration/lib/github-credential";
import { nearlyOutOfQuota, nextLink, providerFetch } from "@/features/code-integration/lib/http";
import type { CodeEvent } from "@/features/code-integration/lib/provider";

// Reading history from GitHub (ADR-0054 §5).
//
// Everything returned here is a `CodeEvent` — the same union the webhook
// adapter produces — so a backfilled link and a webhooked one are written by
// the same function from the same shape.

const PER_PAGE = 100;

function headers(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
}

async function page<T>(
  url: string,
  accessToken: string,
): Promise<{ body: T; cursor: string | null; shouldPause: boolean }> {
  const response = await providerFetch(url, { headers: headers(accessToken) });
  return {
    body: (await response.json()) as T,
    // The provider's own next-link, kept verbatim: it already encodes whatever
    // paging scheme this endpoint uses, and reconstructing one from a page
    // number is how a resumed walk silently skips a page.
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

interface GhRepo {
  id?: number;
  full_name?: string;
  default_branch?: string;
  html_url?: string;
}

interface GhPull {
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  state?: string;
  merged_at?: string | null;
  head?: { ref?: string };
  user?: { login?: string };
  updated_at?: string;
  created_at?: string;
}

interface GhBranch {
  name?: string;
  commit?: { sha?: string };
}

interface GhCommit {
  sha?: string;
  html_url?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
}

function repositoryOf(baseUrl: string, path: string) {
  return { name: path, url: `${baseUrl.replace(/\/+$/, "")}/${path}` };
}

function branchPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

export const GitHubApiClient: CodeApiClient = {
  id: "GITHUB",

  async listRepositories({ baseUrl, accessToken, cursor }): Promise<Page<RepositoryRef>> {
    // The INSTALLATION's repositories, not the user's: an app sees exactly what
    // it was granted at install time, which is the whole point of §1.
    const url =
      cursor ?? `${apiRoot(baseUrl)}/installation/repositories?per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<{ repositories?: GhRepo[] }>(
      url,
      accessToken,
    );
    return {
      items: (body.repositories ?? [])
        .filter((repo) => str(repo.full_name))
        .map((repo) => ({
          externalId: String(repo.id ?? repo.full_name),
          path: repo.full_name!,
          defaultBranch: str(repo.default_branch) ?? null,
          url: str(repo.html_url) ?? `${baseUrl}/${repo.full_name}`,
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
    // Sorted by update time descending so an interrupted walk has already
    // covered the part anybody is looking at. GitHub has no `since` filter on
    // this endpoint, so the window is applied below — which is also why the
    // sort matters: it lets the caller stop at the first item out of range.
    const url =
      cursor ??
      `${apiRoot(baseUrl)}/repos/${repositoryPath}/pulls` +
        `?state=all&sort=updated&direction=desc&per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GhPull[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);

    const items: CodeEvent[] = [];
    let windowExhausted = false;
    for (const pull of body) {
      if (pull.number === undefined) continue;
      const updated = at(pull.updated_at ?? pull.created_at);
      if (updated < since) {
        // Descending order means everything after this is older too.
        windowExhausted = true;
        break;
      }
      items.push({
        kind: "MERGE_REQUEST",
        repository,
        mergeRequest: {
          externalId: String(pull.number),
          title: str(pull.title) ?? `Pull request #${pull.number}`,
          description: str(pull.body ?? undefined) ?? null,
          url: str(pull.html_url) ?? `${repository.url}/pull/${pull.number}`,
          sourceBranch: str(pull.head?.ref) ?? "",
          // The REST list uses `merged_at` where the webhook uses `merged`.
          // Same rule as 34/BR-14, spelled a third way: reading `state` alone
          // would show every merged pull request as Closed.
          state: pull.merged_at ? "MERGED" : str(pull.state) === "closed" ? "CLOSED" : "OPEN",
          authorName: str(pull.user?.login),
          at: updated,
        },
        at: updated,
      });
    }
    return { items, cursor: windowExhausted ? null : next, shouldPause };
  },

  async listBranches({
    baseUrl,
    accessToken,
    repositoryPath,
    cursor,
  }: WalkInput): Promise<Page<CodeEvent>> {
    const url =
      cursor ?? `${apiRoot(baseUrl)}/repos/${repositoryPath}/branches?per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GhBranch[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);
    return {
      items: body
        .filter((branch) => str(branch.name))
        .map((branch) => ({
          kind: "PUSH" as const,
          repository,
          branch: branch.name!,
          branchUrl: `${repository.url}/tree/${branchPath(branch.name!)}`,
          // Empty on purpose — see `listBranches` in api-client.ts. A branch
          // match must not drag in the commits that happen to sit on it.
          commits: [],
          // A branch has no timestamp of its own on this endpoint, and paying
          // for one request per branch to find out is not worth a sort order.
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
      `${apiRoot(baseUrl)}/repos/${repositoryPath}/commits` +
        `?sha=${encodeURIComponent(branch)}&since=${since.toISOString()}&per_page=${PER_PAGE}`;
    const { body, cursor: next, shouldPause } = await page<GhCommit[]>(url, accessToken);
    const repository = repositoryOf(baseUrl, repositoryPath);

    const commits = body
      .filter((commit) => str(commit.sha) && str(commit.commit?.message))
      .map((commit) => ({
        sha: commit.sha!,
        message: commit.commit!.message!,
        url: str(commit.html_url) ?? `${repository.url}/commit/${commit.sha}`,
        authorName: str(commit.commit?.author?.name),
        at: at(commit.commit?.author?.date),
      }));

    // One event carrying the page's commits, shaped exactly like a push: the
    // branch is named, so `linkEvent` links it when it matches and links each
    // commit only when its own message does.
    const items: CodeEvent[] =
      commits.length === 0
        ? []
        : [
            {
              kind: "PUSH",
              repository,
              branch,
              branchUrl: `${repository.url}/tree/${branchPath(branch)}`,
              commits,
              at: commits[0]!.at,
            },
          ];
    return { items, cursor: next, shouldPause };
  },
};
