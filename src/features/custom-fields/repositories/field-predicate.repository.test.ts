import { describe, expect, it } from "vitest";
import { customFieldWhere } from "@/features/custom-fields/repositories/field-predicate.repository";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";

const p = (over: Partial<ResolvedPredicate>): ResolvedPredicate => ({
  fieldId: "f1",
  type: "TEXT",
  op: "eq",
  value: "x",
  ...over,
});

// ADR-0043 §3 — the easiest thing here to get wrong, and the failure is a
// silently empty list rather than an error.
describe("one clause per predicate", () => {
  it("keeps two fields in two separate `some` clauses", () => {
    const clauses = customFieldWhere([
      p({ fieldId: "a", value: "one" }),
      p({ fieldId: "b", value: "two" }),
    ]);
    expect(clauses).toHaveLength(2);
    // Merged into one `some` this would ask for a single value row belonging to
    // both fields, which cannot exist.
    expect(clauses[0]).toEqual({
      customFieldValues: { some: { fieldId: "a", valueText: "one" } },
    });
    expect(clauses[1]).toEqual({
      customFieldValues: { some: { fieldId: "b", valueText: "two" } },
    });
  });
});

// ADR-0043 §4 — works only because clearing deletes the row (ADR-0042 BR-10).
describe("emptiness", () => {
  it("maps is_empty to `none`", () => {
    expect(customFieldWhere([p({ op: "is_empty", value: undefined })])).toEqual([
      { customFieldValues: { none: { fieldId: "f1" } } },
    ]);
  });

  it("maps is_not_empty to a bare `some`", () => {
    expect(customFieldWhere([p({ op: "is_not_empty", value: undefined })])).toEqual([
      { customFieldValues: { some: { fieldId: "f1" } } },
    ]);
  });
});

describe("each type reads its own column", () => {
  it("TEXT contains is case-insensitive", () => {
    expect(customFieldWhere([p({ op: "contains", value: "ac" })])[0]).toEqual({
      customFieldValues: { some: { fieldId: "f1", valueText: { contains: "ac", mode: "insensitive" } } },
    });
  });

  it("NUMBER comparisons use the numeric column", () => {
    expect(customFieldWhere([p({ type: "NUMBER", op: "gt", value: "10" })])[0]).toMatchObject({
      customFieldValues: { some: { valueNumber: { gt: 10 } } },
    });
  });

  it("CHECKBOX accepts only the two literals", () => {
    expect(customFieldWhere([p({ type: "CHECKBOX", value: "true" })])[0]).toMatchObject({
      customFieldValues: { some: { valueBool: true } },
    });
    expect(customFieldWhere([p({ type: "CHECKBOX", value: "yes" })])).toEqual([]);
  });

  it("SELECT matches any of the chosen options", () => {
    expect(
      customFieldWhere([p({ type: "SELECT", op: "any_of", value: ["o1", "o2"] })])[0],
    ).toMatchObject({
      customFieldValues: { some: { optionIds: { hasSome: ["o1", "o2"] } } },
    });
  });

  it("USER matches any of the chosen people", () => {
    expect(
      customFieldWhere([p({ type: "USER", op: "any_of", value: ["u1"] })])[0],
    ).toMatchObject({ customFieldValues: { some: { valueUserId: { in: ["u1"] } } } });
  });
});

// A stored timestamp is almost never midnight, so literal equality would match
// nothing and look broken.
describe("DATE equality means that DAY", () => {
  it("becomes a half-open range over the day", () => {
    const clause = customFieldWhere([p({ type: "DATE", op: "eq", value: "2026-08-10" })])[0];
    const range = (clause as { customFieldValues: { some: { valueDate: { gte: Date; lt: Date } } } })
      .customFieldValues.some.valueDate;
    expect(range.gte.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it("still supports before/after as instants", () => {
    expect(customFieldWhere([p({ type: "DATE", op: "gt", value: "2026-08-10" })])[0]).toMatchObject(
      { customFieldValues: { some: { valueDate: { gt: new Date("2026-08-10") } } } },
    );
  });
});

describe("unusable predicates are dropped, never guessed at", () => {
  it.each([
    ["operator the type forbids", p({ type: "CHECKBOX", op: "contains", value: "x" })],
    ["non-numeric NUMBER", p({ type: "NUMBER", op: "eq", value: "abc" })],
    ["unparseable DATE", p({ type: "DATE", op: "gt", value: "nope" })],
    ["empty any_of", p({ type: "SELECT", op: "any_of", value: [] })],
    ["missing value", p({ op: "eq", value: undefined })],
  ])("drops a %s", (_label, predicate) => {
    expect(customFieldWhere([predicate])).toEqual([]);
  });

  it("keeps the good predicates when one is dropped", () => {
    const clauses = customFieldWhere([
      p({ fieldId: "bad", type: "NUMBER", op: "eq", value: "abc" }),
      p({ fieldId: "good", value: "ok" }),
    ]);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ customFieldValues: { some: { fieldId: "good" } } });
  });
});
