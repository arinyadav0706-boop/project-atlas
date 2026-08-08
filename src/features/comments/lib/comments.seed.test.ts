import { describe, expect, it } from "vitest";
import { generateVerus } from "../../../../prisma/verus/generate";
import { parseMentions } from "./mentions";

// ADR-0033 r1/r7 applied to this module's own change.
//
// Labels shipped complete — schema, service, RBAC, chips, filter — against a
// generator that created zero of them, so every surface had only fixtures
// behind it. Mentions and threads are exactly the same shape of feature, so
// they get the same guard before shipping rather than after someone opens the
// page and finds nothing.

const dataset = generateVerus() as unknown as {
  comments: { id: string; parentCommentId?: string | null; body: string }[];
  commentMentions: { commentId: string; userId: string }[];
  cast: { id: string }[];
};

const roots = dataset.comments.filter((c) => !c.parentCommentId);
const replies = dataset.comments.filter((c) => c.parentCommentId);

const repliesPerRoot = new Map<string, number>();
for (const r of replies) {
  const key = r.parentCommentId!;
  repliesPerRoot.set(key, (repliesPerRoot.get(key) ?? 0) + 1);
}

describe("VERUS exercises mentions and threads", () => {
  it("generates mentions at all", () => {
    expect(dataset.commentMentions.length).toBeGreaterThan(100);
  });

  it("writes a mention row for every token in a body, and no others", () => {
    // The table is a derived index (ADR-0038 §1) — if the two disagree in the
    // seed, they will disagree in production too.
    const fromBodies = new Set<string>();
    for (const c of dataset.comments) {
      for (const m of parseMentions(c.body)) fromBodies.add(`${c.id}::${m.userId}`);
    }
    const fromRows = new Set(dataset.commentMentions.map((m) => `${m.commentId}::${m.userId}`));

    expect(fromRows.size).toBe(fromBodies.size);
    expect([...fromRows].every((k) => fromBodies.has(k))).toBe(true);
  });

  it("names real users, so a chip never renders a dangling id", () => {
    const known = new Set([...dataset.cast.map((u) => u.id), "verus-admin-google", "verus-admin-creds"]);
    const unknown = dataset.commentMentions.filter((m) => !known.has(m.userId));
    expect(unknown).toEqual([]);
  });

  it("generates reply threads", () => {
    expect(replies.length).toBeGreaterThan(100);
    expect(repliesPerRoot.size).toBeGreaterThan(50);
  });

  it("keeps every thread one level deep", () => {
    // A reply whose parent is itself a reply would contradict ADR-0038 §4 and
    // make the thread page's "root + replies" shape a lie.
    const replyIds = new Set(replies.map((r) => r.id));
    const nested = replies.filter((r) => replyIds.has(r.parentCommentId!));
    expect(nested).toEqual([]);
  });

  it("every reply hangs off a comment that exists", () => {
    const rootIds = new Set(roots.map((r) => r.id));
    expect(replies.filter((r) => !rootIds.has(r.parentCommentId!))).toEqual([]);
  });

  it("produces threads longer than the preview, so the thread page is reachable", () => {
    // The whole point of the overflow page. Without this the "View all N
    // replies" link exists in code and never renders on the demo.
    const overflowing = [...repliesPerRoot.values()].filter((n) => n > 3);
    expect(overflowing.length).toBeGreaterThan(20);
  });
});
