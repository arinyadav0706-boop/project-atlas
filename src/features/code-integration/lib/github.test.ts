import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findIssueKeysIn } from "./issue-keys";
import { GitHubAdapter } from "./github";
import { GitLabAdapter } from "./gitlab";
import { searchableText } from "./provider";

// The GitHub adapter (ADR-0053 §9).
//
// Key detection itself is provider-independent and already covered in
// `gitlab.test.ts`; this file is about the two things that are GitHub's alone —
// how a delivery is authenticated, and the places its vocabulary differs from
// GitLab's in ways that would otherwise ship a quiet bug.

const KEYS = ["VWP", "OPS"];
const SECRET = "whsec_a-shared-secret";
const BASE = "https://github.com";

const headers = (init: Record<string, string> = {}) => new Headers(init);

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

const parse = (body: unknown, event: string) =>
  GitHubAdapter.parse({
    headers: headers({ "x-github-event": event }),
    rawBody: typeof body === "string" ? body : JSON.stringify(body),
    baseUrl: BASE,
  });

const repository = {
  full_name: "team/service",
  name: "service",
  html_url: "https://github.com/team/service",
};

describe("GitHub verification", () => {
  const body = JSON.stringify({ zen: "Keep it logically awesome." });

  it("accepts an HMAC-SHA256 of the raw body", () => {
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-hub-signature-256": sign(body) }),
        rawBody: body,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("rejects a body changed by one byte", () => {
    // The whole point of signing rather than sending a token: tampering shows.
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-hub-signature-256": sign(body) }),
        rawBody: body.replace("logically", "logicalIy"),
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-hub-signature-256": sign(body, "some-other-secret") }),
        rawBody: body,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it.each([
    ["a missing header", undefined],
    ["an empty header", ""],
    ["a digest with no prefix", createHmac("sha256", SECRET).update(body).digest("hex")],
    ["a truncated digest", sign(body).slice(0, 20)],
    ["a prefix with no digest", "sha256="],
    ["garbage", "sha256=not-hex-at-all"],
  ])("rejects %s", (_label, value) => {
    expect(
      GitHubAdapter.verify({
        headers: value === undefined ? headers() : headers({ "x-hub-signature-256": value }),
        rawBody: body,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("ignores the legacy SHA-1 header, even when it is correct", () => {
    // GitHub still sends `X-Hub-Signature` (SHA-1) alongside the SHA-256 one.
    // Accepting it would let a caller pick the weaker digest — a downgrade we
    // would have opted into ourselves. Only the SHA-256 header counts.
    const sha1 = `sha1=${createHmac("sha1", SECRET).update(body).digest("hex")}`;
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-hub-signature": sha1 }),
        rawBody: body,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("does NOT accept the secret sent verbatim — that is GitLab's scheme", () => {
    // The mirror of the assertion in gitlab.test.ts. If somebody later
    // "unifies" verification into one shared function, one of the two fails.
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-gitlab-token": SECRET }),
        rawBody: body,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature over a re-serialised body (BR-15)", () => {
    // Real GitHub JSON has spaces after the colons; `JSON.stringify` does not.
    // Signing what we parsed instead of what arrived is the classic way to
    // make webhook auth fail intermittently and inexplicably.
    const asSent = '{"zen": "Keep it logically awesome."}';
    const reserialised = JSON.stringify(JSON.parse(asSent));
    expect(reserialised).not.toBe(asSent);
    expect(
      GitHubAdapter.verify({
        headers: headers({ "x-hub-signature-256": sign(reserialised) }),
        rawBody: asSent,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});

describe("GitHub push events", () => {
  const push = {
    ref: "refs/heads/feature/VWP-1-login",
    deleted: false,
    repository,
    pusher: { name: "priya" },
    commits: [
      {
        id: "aabbcc112233",
        message: "VWP-1 add the login form",
        url: "https://github.com/team/service/commit/aabbcc112233",
        timestamp: "2026-08-27T10:00:00Z",
        author: { name: "Priya Sharma", username: "priya" },
      },
    ],
  };

  it("normalises a push", () => {
    const event = parse(push, "push")!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.branch).toBe("feature/VWP-1-login");
    expect(event.repository.name).toBe("team/service");
    expect(event.commits).toHaveLength(1);
    expect(event.commits[0]!.authorName).toBe("Priya Sharma");
  });

  it("builds a branch URL in GitHub's shape, keeping the slashes", () => {
    const event = parse(push, "push")!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    // GitLab's is `/-/tree/`, and it tolerates a percent-encoded slash.
    // GitHub's is `/tree/` and does not — `feature%2FVWP-1` 404s.
    expect(event.branchUrl).toBe("https://github.com/team/service/tree/feature/VWP-1-login");
  });

  it("offers the branch and every commit message for key matching", () => {
    expect(searchableText(parse(push, "push")!)).toEqual([
      "feature/VWP-1-login",
      "VWP-1 add the login form",
    ]);
  });

  it("ignores a branch deletion", () => {
    // `deleted: true` still carries the ref, so a naive adapter creates a
    // branch link for a branch that no longer exists.
    expect(parse({ ...push, deleted: true, commits: [] }, "push")).toBeNull();
  });

  it("ignores a tag push", () => {
    expect(parse({ ...push, ref: "refs/tags/v1.2.0" }, "push")).toBeNull();
  });

  it("falls back to the pusher when a commit has no author name", () => {
    const event = parse(
      { ...push, commits: [{ id: "deadbeef", message: "VWP-2 fix", timestamp: "2026-08-27T10:00:00Z" }] },
      "push",
    )!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.commits[0]!.authorName).toBe("priya");
  });

  it("survives a malformed timestamp rather than dropping the delivery", () => {
    const event = parse(
      { ...push, commits: [{ id: "deadbeef", message: "VWP-2 fix", timestamp: "nope" }] },
      "push",
    )!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.commits[0]!.at.getTime()).not.toBeNaN();
  });

  it("drops commits with no id or message rather than linking junk", () => {
    const event = parse({ ...push, commits: [{ id: "x" }, { message: "y" }, {}] }, "push")!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.commits).toEqual([]);
  });
});

describe("GitHub pull_request events", () => {
  const pr = (over: Record<string, unknown> = {}) => ({
    action: "opened",
    repository,
    pull_request: {
      number: 42,
      title: "VWP-1 Add login",
      body: "Also closes OPS-3",
      html_url: "https://github.com/team/service/pull/42",
      state: "open",
      merged: false,
      head: { ref: "feature/VWP-1-login" },
      user: { login: "priya" },
      updated_at: "2026-08-27T11:00:00Z",
      ...over,
    },
  });

  it("normalises an open pull request", () => {
    const event = parse(pr(), "pull_request")!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.externalId).toBe("42");
    expect(event.mergeRequest.state).toBe("OPEN");
    expect(event.mergeRequest.authorName).toBe("priya");
    expect(event.mergeRequest.sourceBranch).toBe("feature/VWP-1-login");
  });

  // BR-14. The single most important assertion in this file: GitHub has no
  // merged state, so a merged PR arrives as `closed` + `merged: true`. An
  // adapter reading `state` alone shows every merged pull request as Closed and
  // never fires the on-merge transition — and looks perfectly correct in review.
  it("maps a MERGED pull request from state:closed + merged:true", () => {
    const event = parse(
      pr({ state: "closed", merged: true, merged_at: "2026-08-27T12:00:00Z" }),
      "pull_request",
    )!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.state).toBe("MERGED");
  });

  it("maps a pull request closed WITHOUT merging to CLOSED", () => {
    const event = parse(pr({ state: "closed", merged: false }), "pull_request")!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.state).toBe("CLOSED");
  });

  it("treats a missing `merged` flag as not merged rather than guessing", () => {
    const withoutMergedFlag: Record<string, unknown> = { ...pr().pull_request, state: "closed" };
    delete withoutMergedFlag.merged;
    const event = parse({ repository, pull_request: withoutMergedFlag }, "pull_request")!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.state).toBe("CLOSED");
  });

  it("searches the branch, the title AND the body", () => {
    expect(
      findIssueKeysIn(searchableText(parse(pr(), "pull_request")!), KEYS).map((m) => m.key),
    ).toEqual(["VWP-1", "OPS-3"]);
  });

  it("handles a null body, which is what GitHub sends for an empty description", () => {
    const event = parse(pr({ body: null }), "pull_request")!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.description).toBeNull();
  });

  it("ignores a pull request with no number", () => {
    expect(parse({ repository, pull_request: {} }, "pull_request")).toBeNull();
  });
});

describe("GitHub check_suite events", () => {
  const suite = (over: Record<string, unknown> = {}) => ({
    repository,
    check_suite: {
      head_branch: "feature/VWP-1-login",
      head_sha: "aabbcc112233",
      status: "completed",
      conclusion: "success",
      updated_at: "2026-08-27T12:00:00Z",
      ...over,
    },
  });

  it("reports the conclusion once a suite has finished", () => {
    const event = parse(suite(), "check_suite")!;
    if (event.kind !== "PIPELINE") throw new Error("wrong kind");
    expect(event.ref).toBe("feature/VWP-1-login");
    // Not "completed" — that says the run ended, not whether it passed, and a
    // grey chip saying "completed" over a failing build is worse than nothing.
    expect(event.status).toBe("success");
  });

  it("reports failure as GitHub words it, which the panel already tones", () => {
    // GitLab says "failed", GitHub says "failure". Both are red in the panel;
    // neither adapter translates, because inventing a shared vocabulary would
    // mean guessing at the next provider's words too.
    const event = parse(suite({ conclusion: "failure" }), "check_suite")!;
    if (event.kind !== "PIPELINE") throw new Error("wrong kind");
    expect(event.status).toBe("failure");
  });

  it("falls back to the progress status while a suite is still running", () => {
    const event = parse(
      suite({ status: "in_progress", conclusion: null }),
      "check_suite",
    )!;
    if (event.kind !== "PIPELINE") throw new Error("wrong kind");
    expect(event.status).toBe("in_progress");
  });

  it("points at the commit's checks tab, which is a page that exists", () => {
    const event = parse(suite(), "check_suite")!;
    if (event.kind !== "PIPELINE") throw new Error("wrong kind");
    expect(event.url).toBe("https://github.com/team/service/commits/aabbcc112233/checks");
  });

  it("ignores a suite with no head branch", () => {
    // Happens for a suite on a detached ref; there is nothing to attach it to.
    expect(parse(suite({ head_branch: null }), "check_suite")).toBeNull();
  });
});

describe("everything else", () => {
  it.each([
    ["a ping on hook creation", "ping", { zen: "Anything added dilutes everything else." }],
    ["an issues event", "issues", { issue: { number: 1 } }],
    ["a release", "release", {}],
    ["a workflow_job", "workflow_job", {}],
    ["an unknown event", "future_thing", {}],
  ])("returns null for %s, which is not an error", (_label, event, body) => {
    expect(parse(body, event)).toBeNull();
  });

  it("returns null for a body that is not JSON at all", () => {
    expect(parse("not json", "push")).toBeNull();
    expect(parse("", "push")).toBeNull();
  });

  it("reads a form-encoded body, because that is GitHub's DEFAULT content type", () => {
    // The setup screen asks for `application/json`. Somebody will leave the
    // default, and the failure mode is the worst one available: verification
    // passes (GitHub signs whatever it sent), events arrive, the admin screen
    // says the hook is wired — and nothing ever links.
    const json = JSON.stringify({
      ref: "refs/heads/feature/VWP-1-login",
      repository,
      commits: [{ id: "aa", message: "VWP-1 fix", timestamp: "2026-08-27T10:00:00Z" }],
    });
    const event = parse(`payload=${encodeURIComponent(json)}`, "push")!;
    expect(event).not.toBeNull();
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.branch).toBe("feature/VWP-1-login");
    expect(event.commits).toHaveLength(1);
  });

  it("returns null when the event header is missing, because the body never says", () => {
    // GitLab keeps `object_kind` in the body and can recover from a proxy that
    // strips headers. GitHub cannot — recorded in ADR-0053 §9 rather than
    // worked around, because there is nothing to work around it with.
    expect(
      GitHubAdapter.parse({
        headers: headers(),
        rawBody: JSON.stringify({ ref: "refs/heads/main", repository, commits: [] }),
        baseUrl: BASE,
      }),
    ).toBeNull();
  });

  it("falls back to the connection's host when a payload has no repository URL", () => {
    const event = parse({ ref: "refs/heads/main", commits: [] }, "push")!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.repository.url).toBe(BASE);
    expect(event.repository.name).toBe("unknown");
  });
});

// The seam's actual claim (ADR-0053 §4): everything downstream sees one shape.
// If a future change makes the two adapters disagree about what a push IS,
// rather than about how a provider spells it, this is what notices.
describe("the two providers normalise to the same thing", () => {
  const gitlabPush = GitLabAdapter.parse({
    headers: headers(),
    rawBody: JSON.stringify({
      object_kind: "push",
      ref: "refs/heads/feature/VWP-1-login",
      project: { path_with_namespace: "team/service", web_url: "https://gl/team/service" },
      commits: [
        {
          id: "aabbcc112233",
          message: "VWP-1 add the login form",
          url: "https://gl/team/service/-/commit/aabbcc112233",
          timestamp: "2026-08-27T10:00:00Z",
          author: { name: "Priya Sharma" },
        },
      ],
    }),
    baseUrl: "https://gl",
  })!;

  const githubPush = parse(
    {
      ref: "refs/heads/feature/VWP-1-login",
      repository,
      pusher: { name: "priya" },
      commits: [
        {
          id: "aabbcc112233",
          message: "VWP-1 add the login form",
          url: "https://github.com/team/service/commit/aabbcc112233",
          timestamp: "2026-08-27T10:00:00Z",
          author: { name: "Priya Sharma" },
        },
      ],
    },
    "push",
  )!;

  it("agrees on the branch, the commits and the searchable text", () => {
    expect(githubPush.kind).toBe(gitlabPush.kind);
    if (gitlabPush.kind !== "PUSH" || githubPush.kind !== "PUSH") throw new Error("wrong kind");
    expect(githubPush.branch).toBe(gitlabPush.branch);
    expect(githubPush.repository.name).toBe(gitlabPush.repository.name);
    expect(githubPush.commits.map((c) => c.sha)).toEqual(gitlabPush.commits.map((c) => c.sha));
    expect(searchableText(githubPush)).toEqual(searchableText(gitlabPush));
  });

  it("agrees that a merged change is MERGED, spelled differently on each side", () => {
    const gitlabMerged = GitLabAdapter.parse({
      headers: headers(),
      rawBody: JSON.stringify({
        object_kind: "merge_request",
        project: { path_with_namespace: "team/service", web_url: "https://gl/team/service" },
        object_attributes: { iid: 42, title: "VWP-1", state: "merged" },
      }),
      baseUrl: "https://gl",
    })!;
    const githubMerged = parse(
      {
        repository,
        pull_request: { number: 42, title: "VWP-1", state: "closed", merged: true },
      },
      "pull_request",
    )!;
    if (gitlabMerged.kind !== "MERGE_REQUEST" || githubMerged.kind !== "MERGE_REQUEST") {
      throw new Error("wrong kind");
    }
    expect(githubMerged.mergeRequest.state).toBe(gitlabMerged.mergeRequest.state);
    expect(githubMerged.mergeRequest.externalId).toBe(gitlabMerged.mergeRequest.externalId);
  });
});
