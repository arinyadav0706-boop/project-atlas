import { describe, expect, it } from "vitest";
import {
  decodePredicate,
  encodePredicate,
  isOperatorAllowed,
  operatorsFor,
} from "@/features/custom-fields/lib/field-predicate";

describe("operators are bounded by type", () => {
  it("refuses `contains` on a checkbox rather than ignoring it", () => {
    expect(isOperatorAllowed("CHECKBOX", "contains")).toBe(false);
  });

  it("allows substring search only on the text-ish types", () => {
    expect(isOperatorAllowed("TEXT", "contains")).toBe(true);
    expect(isOperatorAllowed("URL", "contains")).toBe(true);
    expect(isOperatorAllowed("NUMBER", "contains")).toBe(false);
  });

  it("gives every type an emptiness test", () => {
    for (const type of ["TEXT", "NUMBER", "DATE", "CHECKBOX", "SELECT", "MULTI_SELECT", "USER", "URL"] as const) {
      expect(operatorsFor(type)).toContain("is_empty");
      expect(operatorsFor(type)).toContain("is_not_empty");
    }
  });
});

describe("query-string round trip", () => {
  it.each([
    { fieldId: "f1", op: "is_empty" as const },
    { fieldId: "f1", op: "eq" as const, value: "Acme" },
    { fieldId: "f1", op: "contains" as const, value: "ac me" },
    { fieldId: "f1", op: "any_of" as const, value: ["o1", "o2"] },
    { fieldId: "f1", op: "gt" as const, value: "42" },
  ])("survives %j", (predicate) => {
    expect(decodePredicate(encodePredicate(predicate))).toEqual(predicate);
  });

  // The reason the value is percent-encoded and the split counts colons.
  it("keeps a URL value intact, colons and all", () => {
    const p = { fieldId: "f1", op: "eq" as const, value: "https://e.com:8443/a?b=c" };
    expect(decodePredicate(encodePredicate(p))).toEqual(p);
  });

  it("keeps a comma-free value with a comma in it out of any_of", () => {
    const p = { fieldId: "f1", op: "eq" as const, value: "Acme, Inc" };
    expect(decodePredicate(encodePredicate(p))?.value).toBe("Acme, Inc");
  });
});

// A stale or hand-edited link must open the list unfiltered, never 500.
describe("malformed input is dropped, not thrown", () => {
  it.each([
    "",
    "nocolon",
    ":eq:x",
    "f1:not_an_operator:x",
    "f1:eq",
    "f1:eq:",
    "f1:eq:%E0%A4%A",
  ])("returns null for %p", (raw) => {
    expect(decodePredicate(raw)).toBeNull();
  });
});
