import { describe, expect, it } from "vitest";
import { parseIssueFilter } from "./issue-filter.schemas";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";

// The shared filter parser (ADR-0008). Every list route reads its constraints
// through this, and two of them decide a default from how many keys come back.

describe("an empty query is an EMPTY filter", () => {
  // The regression. Zod keeps a key whose value parsed to `undefined`, so this
  // used to return fifteen keys — semantically empty, but
  // `Object.keys(filter).length` said fifteen. The Timeline and the Calendar
  // both default to open work by asking exactly that question, so the default
  // never fired and both opened on the archive instead. Nothing tested it,
  // because the parser was "obviously" fine.
  it("has no keys at all", () => {
    expect(parseIssueFilter(new URLSearchParams())).toEqual({});
    expect(Object.keys(parseIssueFilter(new URLSearchParams()))).toHaveLength(0);
  });

  it("still has no keys when the query is present but says nothing", () => {
    // A blank `search=` means "no filter", not "match the empty string".
    const q = new URLSearchParams("search=&hasEstimate=maybe&subtask=yes");
    expect(parseIssueFilter(q)).toEqual({});
  });
});

describe("what it does keep", () => {
  it("keeps only the constraints that were actually set", () => {
    const q = new URLSearchParams("openOnly=true&priority=HIGH");
    expect(parseIssueFilter(q)).toEqual({ openOnly: true, priority: "HIGH" });
  });

  it("keeps a FALSE that is a real constraint", () => {
    // `hasEstimate=false` means "unestimated" — dropping it because it is
    // falsy would silently widen the filter.
    expect(parseIssueFilter(new URLSearchParams("hasEstimate=false"))).toEqual({
      hasEstimate: false,
    });
    expect(parseIssueFilter(new URLSearchParams("blocked=false"))).toEqual({
      blocked: false,
    });
  });

  it("round-trips through the query builder", () => {
    const filter = { openOnly: true, priority: "HIGH", search: "billing" } as const;
    expect(parseIssueFilter(issueFilterToQuery(filter))).toEqual(filter);
  });

  it("round-trips an empty filter to an empty filter", () => {
    expect(parseIssueFilter(issueFilterToQuery({}))).toEqual({});
  });
});
