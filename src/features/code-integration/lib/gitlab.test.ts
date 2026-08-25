import { describe, expect, it } from "vitest";
import { findIssueKeys, findIssueKeysIn } from "./issue-keys";
import { GitLabAdapter } from "./gitlab";
import { searchableText } from "./provider";

// The pure core of the code integration (ADR-0053 §1, §3, §4).
//
// Two things decide whether this feature is loved or switched off: whether it
// finds the key a developer typed, and whether it invents ones they did not.
// Both are here.

const KEYS = ["VWP", "OPS", "VDP", "A"];

const headers = (init: Record<string, string> = {}) => new Headers(init);
const parse = (body: unknown, init: Record<string, string> = {}) =>
  GitLabAdapter.parse({
    headers: headers(init),
    rawBody: typeof body === "string" ? body : JSON.stringify(body),
    baseUrl: "https://gitlab.example.com",
  });

describe("finding issue keys", () => {
  it("finds one in a branch name, a commit message and a title", () => {
    expect(findIssueKeys("feature/VWP-1-login", KEYS).map((m) => m.key)).toEqual(["VWP-1"]);
    expect(findIssueKeys("VWP-42: fix the thing", KEYS).map((m) => m.key)).toEqual(["VWP-42"]);
    expect(findIssueKeys("Closes VWP-7.", KEYS).map((m) => m.key)).toEqual(["VWP-7"]);
  });

  it("is case-insensitive, because git users are", () => {
    expect(findIssueKeys("feature/vwp-1-login", KEYS).map((m) => m.key)).toEqual(["VWP-1"]);
    expect(findIssueKeys("Vwp-1", KEYS).map((m) => m.key)).toEqual(["VWP-1"]);
  });

  it("finds several, de-duplicated, in order", () => {
    expect(
      findIssueKeys("VWP-1 and OPS-2 and VWP-1 again", KEYS).map((m) => m.key),
    ).toEqual(["VWP-1", "OPS-2"]);
  });

  it("normalises leading zeros, so VWP-007 is VWP-7", () => {
    expect(findIssueKeys("VWP-007", KEYS).map((m) => m.key)).toEqual(["VWP-7"]);
  });

  // The half of the feature that decides whether anybody keeps it switched on.
  describe("does NOT invent links", () => {
    it.each([
      ["a text encoding", "re-encode the file as UTF-8"],
      ["a date standard", "parse timestamps per ISO-8601"],
      ["a hash", "checksum with SHA-256"],
      ["an RFC", "error shape follows RFC-9457"],
      ["a CVE", "patches CVE-2026-1234"],
      ["a cipher suite", "switch to AES-256-GCM"],
      ["HTTP/2", "upgrade to HTTP-2 transport"],
      ["a lowercase word", "fix the utf-8 handling"],
    ])("ignores %s", (_label, text) => {
      expect(findIssueKeys(text, KEYS)).toEqual([]);
    });

    it("ignores a key whose project this organisation does not have", () => {
      // The filter, not the pattern, is what makes the list above safe.
      expect(findIssueKeys("JIRA-123 and ABC-1", KEYS)).toEqual([]);
    });

    it("does not match mid-token", () => {
      expect(findIssueKeys("xVWP-1", KEYS)).toEqual([]);
      expect(findIssueKeys("9VWP-1", KEYS)).toEqual([]);
      // The one that a naive `[A-Z]+-\d+` gets wrong: `S-256` out of AES-256.
      expect(findIssueKeys("AES-256", ["AES", "S"])).toEqual([
        { key: "AES-256", projectKey: "AES" },
      ]);
    });

    it("refuses an absurdly long number rather than treating a sha as a key", () => {
      expect(findIssueKeys("VWP-1234567890123", KEYS)).toEqual([]);
    });

    it("handles a single-letter project key, which is legal", () => {
      expect(findIssueKeys("A-9 done", KEYS).map((m) => m.key)).toEqual(["A-9"]);
    });
  });

  it("searches several texts at once, de-duplicated across them", () => {
    expect(
      findIssueKeysIn(["feature/VWP-1", "VWP-1: the title", "also OPS-3", null], KEYS).map(
        (m) => m.key,
      ),
    ).toEqual(["VWP-1", "OPS-3"]);
  });

  it("returns nothing for empty input rather than throwing", () => {
    expect(findIssueKeys(null, KEYS)).toEqual([]);
    expect(findIssueKeys("", KEYS)).toEqual([]);
    expect(findIssueKeys("VWP-1", [])).toEqual([]);
  });
});

// GitLab's scheme, which is NOT GitHub's — see ADR-0053 §1.
describe("GitLab verification", () => {
  it("compares the token verbatim; there is no HMAC", () => {
    expect(
      GitLabAdapter.verify({
        headers: headers({ "x-gitlab-token": "s3cret" }),
        rawBody: "{}",
        secret: "s3cret",
      }),
    ).toBe(true);
  });

  it.each([
    ["a wrong token", "nope"],
    ["a prefix of the token", "s3cre"],
    ["an empty token", ""],
  ])("rejects %s", (_label, token) => {
    expect(
      GitLabAdapter.verify({
        headers: headers({ "x-gitlab-token": token }),
        rawBody: "{}",
        secret: "s3cret",
      }),
    ).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(GitLabAdapter.verify({ headers: headers(), rawBody: "{}", secret: "s3cret" })).toBe(
      false,
    );
  });

  it("does NOT accept an HMAC of the body — that is GitHub's scheme", () => {
    // Pinning the difference the provider interface exists for. If someone
    // later "unifies" verification, this fails.
    const hmac =
      "sha256=8f1e2c0d0f3a4b5c6d7e8f90112233445566778899aabbccddeeff0011223344";
    expect(
      GitLabAdapter.verify({
        headers: headers({ "x-hub-signature-256": hmac }),
        rawBody: "{}",
        secret: "s3cret",
      }),
    ).toBe(false);
  });
});

describe("GitLab push hooks", () => {
  const push = {
    object_kind: "push",
    ref: "refs/heads/feature/VWP-1-login",
    user_name: "Priya Sharma",
    project: {
      path_with_namespace: "team/service",
      web_url: "https://gitlab.example.com/team/service",
    },
    commits: [
      {
        id: "aabbcc112233",
        message: "VWP-1 add the login form",
        url: "https://gitlab.example.com/team/service/-/commit/aabbcc112233",
        timestamp: "2026-08-22T10:00:00Z",
        author: { name: "Priya Sharma" },
      },
    ],
  };

  it("normalises a push", () => {
    const event = parse(push)!;
    expect(event.kind).toBe("PUSH");
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    // `refs/heads/` stripped — a branch link labelled with the full ref is
    // noise nobody would type.
    expect(event.branch).toBe("feature/VWP-1-login");
    expect(event.repository.name).toBe("team/service");
    expect(event.commits).toHaveLength(1);
    expect(event.commits[0]!.sha).toBe("aabbcc112233");
    expect(event.commits[0]!.authorName).toBe("Priya Sharma");
  });

  it("offers the branch and every commit message for key matching", () => {
    const event = parse(push)!;
    expect(searchableText(event)).toEqual([
      "feature/VWP-1-login",
      "VWP-1 add the login form",
    ]);
  });

  it("ignores a tag push — there is no branch to link", () => {
    expect(parse({ ...push, ref: "refs/tags/v1.2.0" })).toBeNull();
  });

  it("survives a commit with no timestamp rather than dropping the delivery", () => {
    const event = parse({
      ...push,
      commits: [{ id: "deadbeef", message: "VWP-2 fix", timestamp: "not-a-date" }],
    })!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.commits[0]!.at.getTime()).not.toBeNaN();
  });

  it("drops commits with no id or message rather than linking junk", () => {
    const event = parse({ ...push, commits: [{ id: "x" }, { message: "y" }, {}] })!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.commits).toEqual([]);
  });
});

describe("GitLab merge request hooks", () => {
  const mr = (over: Record<string, unknown> = {}) => ({
    object_kind: "merge_request",
    user_name: "Dev Patel",
    project: {
      path_with_namespace: "team/service",
      web_url: "https://gitlab.example.com/team/service",
    },
    object_attributes: {
      iid: 42,
      title: "VWP-1 Add login",
      description: "Also closes OPS-3",
      url: "https://gitlab.example.com/team/service/-/merge_requests/42",
      source_branch: "feature/VWP-1-login",
      state: "opened",
      updated_at: "2026-08-22T11:00:00Z",
      ...over,
    },
  });

  it("normalises an opened merge request", () => {
    const event = parse(mr())!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.externalId).toBe("42");
    expect(event.mergeRequest.state).toBe("OPEN");
    expect(event.mergeRequest.authorName).toBe("Dev Patel");
  });

  it.each([
    ["merged", "MERGED"],
    ["closed", "CLOSED"],
    ["opened", "OPEN"],
    // Transient during a merge; showing it would flicker the panel into a
    // state that means nothing to a reader.
    ["locked", "OPEN"],
  ])("maps state %s to %s", (raw, expected) => {
    const event = parse(mr({ state: raw }))!;
    if (event.kind !== "MERGE_REQUEST") throw new Error("wrong kind");
    expect(event.mergeRequest.state).toBe(expected);
  });

  it("searches the branch, the title AND the description", () => {
    // A key mentioned only in the description is the common "also closes"
    // case, and missing it is the most-reported gap in tools that do not.
    expect(findIssueKeysIn(searchableText(parse(mr())!), KEYS).map((m) => m.key)).toEqual([
      "VWP-1",
      "OPS-3",
    ]);
  });

  it("ignores a merge request with no iid", () => {
    expect(parse({ object_kind: "merge_request", object_attributes: {} })).toBeNull();
  });
});

describe("GitLab pipeline hooks", () => {
  it("normalises a pipeline", () => {
    const event = parse({
      object_kind: "pipeline",
      project: { path_with_namespace: "team/service", web_url: "https://g/x" },
      object_attributes: { id: 9, ref: "feature/VWP-1-login", status: "success" },
    })!;
    if (event.kind !== "PIPELINE") throw new Error("wrong kind");
    expect(event.ref).toBe("feature/VWP-1-login");
    expect(event.status).toBe("success");
  });

  it("ignores one with no ref or status", () => {
    expect(parse({ object_kind: "pipeline", object_attributes: { id: 9 } })).toBeNull();
  });
});

describe("everything else", () => {
  it.each([
    ["a note hook", { object_kind: "note" }],
    ["an issue hook", { object_kind: "issue" }],
    ["a wiki hook", { object_kind: "wiki_page" }],
    ["an unknown kind", { object_kind: "future_thing" }],
    ["an empty body", {}],
  ])("returns null for %s, which is not an error", (_label, body) => {
    expect(parse(body)).toBeNull();
  });

  it("returns null for a body that is not JSON at all", () => {
    // A misconfigured hook posting form data must not 500 us — BR-8.
    expect(parse("not json")).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("falls back to the connection's host when a payload has no project URL", () => {
    const event = parse({
      object_kind: "push",
      ref: "refs/heads/main",
      commits: [],
    })!;
    if (event.kind !== "PUSH") throw new Error("wrong kind");
    expect(event.repository.url).toBe("https://gitlab.example.com");
    expect(event.repository.name).toBe("unknown");
  });

  it("reads the kind from the header when the body omits it", () => {
    const event = parse(
      { ref: "refs/heads/main", commits: [] },
      { "x-gitlab-event": "Push Hook" },
    )!;
    expect(event.kind).toBe("PUSH");
  });
});
