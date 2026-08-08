import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  formatMention,
  insertMention,
  parseMentions,
  plainPreview,
  segmentBody,
  tokensToDisplay,
  displayToTokens,
} from "./mentions";

const token = (name: string, id: string) => `@[${name}](user:${id})`;

describe("parseMentions", () => {
  it("finds every distinct user", () => {
    const body = `${token("Arin Yadav", "u1")} and ${token("Sam Rao", "u2")} please look`;
    expect(parseMentions(body)).toEqual([
      { userId: "u1", name: "Arin Yadav" },
      { userId: "u2", name: "Sam Rao" },
    ]);
  });

  it("dedupes a user named twice, keeping the first spelling", () => {
    const body = `${token("Arin", "u1")} ping ${token("Arin Yadav", "u1")}`;
    expect(parseMentions(body)).toEqual([{ userId: "u1", name: "Arin" }]);
  });

  it("does not treat a bare @name as a mention", () => {
    // Only the structured token counts — a name match would break on rename
    // and on the many people who share a first name (ADR-0038 §1).
    expect(parseMentions("@arin can you look?")).toEqual([]);
  });

  it("ignores a token whose id is not id-shaped", () => {
    expect(parseMentions("@[Nope](user:../../etc/passwd)")).toEqual([]);
    expect(parseMentions("@[Nope](user:<script>)")).toEqual([]);
  });

  it("returns nothing for a body with no mentions", () => {
    expect(parseMentions("just a comment")).toEqual([]);
  });

  it("has no cap — a whole team can be named", () => {
    const many = Array.from({ length: 150 }, (_, i) => token(`P${i}`, `u${i}`)).join(" ");
    expect(parseMentions(many)).toHaveLength(150);
  });
});

describe("segmentBody", () => {
  it("splits text and mentions in order", () => {
    expect(segmentBody(`hi ${token("Sam", "u2")} bye`)).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", name: "Sam", userId: "u2" },
      { kind: "text", text: " bye" },
    ]);
  });

  it("keeps markup as plain text so the renderer never has to trust it", () => {
    // The XSS boundary: a segment is either text (React escapes it) or a
    // mention built from an id-shaped capture. Nothing reaches innerHTML.
    const segments = segmentBody("<script>alert(1)</script>");
    expect(segments).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
  });

  it("handles a body that is only a mention", () => {
    expect(segmentBody(token("Sam", "u2"))).toEqual([
      { kind: "mention", name: "Sam", userId: "u2" },
    ]);
  });

  it("round-trips: segments rejoin to the original body", () => {
    const body = `a ${token("X", "u1")} b ${token("Y", "u2")}`;
    const rejoined = segmentBody(body)
      .map((s) => (s.kind === "mention" ? token(s.name, s.userId) : s.text))
      .join("");
    expect(rejoined).toBe(body);
  });
});

describe("formatMention", () => {
  it("strips bracket characters that would terminate the token early", () => {
    expect(formatMention({ id: "u1", name: "Sam [Contractor] (EU)" })).toBe(
      "@[Sam Contractor EU](user:u1)",
    );
  });

  it("falls back rather than emitting an empty label", () => {
    expect(formatMention({ id: "u1", name: "[]" })).toBe("@[user](user:u1)");
  });
});

describe("activeMentionQuery", () => {
  it("detects a run at the caret", () => {
    expect(activeMentionQuery("hey @ar", 7)).toEqual({ query: "ar", from: 4 });
  });

  it("fires on an empty run, so the menu opens the moment @ is typed", () => {
    expect(activeMentionQuery("hey @", 5)).toEqual({ query: "", from: 4 });
  });

  it("ignores an @ mid-word, which is an email not a mention", () => {
    expect(activeMentionQuery("mail arin@example.com", 21)).toBeNull();
  });

  it("closes once a token is complete", () => {
    const body = `${token("Sam", "u2")} `;
    expect(activeMentionQuery(body, body.length)).toBeNull();
  });

  it("stops at a newline", () => {
    expect(activeMentionQuery("@sam\nnext line", 14)).toBeNull();
  });

  it("gives up on a very long run rather than searching prose", () => {
    expect(activeMentionQuery(`@${"x".repeat(41)}`, 42)).toBeNull();
  });

  it("uses the caret, not the end of the text", () => {
    // Caret sits inside "@ar"; the trailing text must not be swallowed.
    expect(activeMentionQuery("hey @ar and more", 7)).toEqual({ query: "ar", from: 4 });
  });
});

describe("insertMention", () => {
  it("replaces the run and leaves the caret after the token", () => {
    const result = insertMention("hey @ar", { from: 4 }, 7, { id: "u1", name: "Arin" });
    expect(result.text).toBe("hey @[Arin](user:u1) ");
    expect(result.caret).toBe(result.text.length);
  });

  it("preserves text after the caret", () => {
    const result = insertMention("hey @ar rest", { from: 4 }, 7, { id: "u1", name: "Arin" });
    expect(result.text).toBe("hey @[Arin](user:u1) rest");
  });
});

describe("plainPreview", () => {
  it("flattens tokens to readable names", () => {
    expect(plainPreview(`${token("Arin Yadav", "u1")} take a look`)).toBe(
      "@Arin Yadav take a look",
    );
  });

  it("collapses whitespace and truncates", () => {
    expect(plainPreview("a\n\n   b", 100)).toBe("a b");
    expect(plainPreview("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("display form (what the composer shows)", () => {
  it("never shows an id", () => {
    // The defect this exists for: the box read
    // "@[Amelia Nair](user:verus-u-062)" while someone was typing.
    const { text } = tokensToDisplay(`${token("Amelia Nair", "verus-u-062")} hey`);
    expect(text).toBe("@Amelia Nair hey");
    expect(text).not.toContain("user:");
  });

  it("round-trips a picked mention back to its id", () => {
    const { text, picked } = tokensToDisplay(token("Amelia Nair", "u-62"));
    expect(displayToTokens(text, picked)).toBe(token("Amelia Nair", "u-62"));
  });

  it("prefers the longer name when one is a prefix of another", () => {
    const picked = [
      { name: "Amelia", userId: "u-1" },
      { name: "Amelia Nair", userId: "u-2" },
    ];
    expect(displayToTokens("@Amelia Nair shipped it", picked)).toBe(
      `${token("Amelia Nair", "u-2")} shipped it`,
    );
  });

  it("does not match a name inside a longer one", () => {
    expect(displayToTokens("@Samantha", [{ name: "Sam", userId: "u-1" }])).toBe("@Samantha");
  });

  it("leaves a hand-edited name as plain text rather than guessing", () => {
    // Better to under-notify visibly than to notify the wrong person silently.
    expect(displayToTokens("@Amelia Nai", [{ name: "Amelia Nair", userId: "u-2" }])).toBe(
      "@Amelia Nai",
    );
  });

  it("survives a name containing regex metacharacters", () => {
    const picked = [{ name: "A. (Sam) O'Neil", userId: "u-3" }];
    expect(displayToTokens("@A. (Sam) O'Neil hi", picked)).toContain("user:u-3");
  });

  it("ignores a picked name the user never typed", () => {
    expect(displayToTokens("no mention here", [{ name: "Amelia", userId: "u-1" }])).toBe(
      "no mention here",
    );
  });
});
