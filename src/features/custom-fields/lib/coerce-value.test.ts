import { describe, expect, it } from "vitest";
import { coerceValue, readValue } from "@/features/custom-fields/lib/coerce-value";
import type { CustomFieldOptionDto } from "@/features/custom-fields/types/custom-field.types";

const options: CustomFieldOptionDto[] = [
  { id: "o1", label: "Tier 1", position: 0 },
  { id: "o2", label: "Tier 2", position: 1 },
];

describe("clearing (BR-10)", () => {
  it.each([null, undefined, ""])("treats %p as a clear for TEXT", (raw) => {
    expect(coerceValue(raw, "TEXT", [])).toEqual({ ok: true, clear: true });
  });

  it("treats whitespace-only text as a clear, not as a space", () => {
    expect(coerceValue("   ", "TEXT", [])).toEqual({ ok: true, clear: true });
  });

  it("treats an empty multi-select as a clear", () => {
    expect(coerceValue([], "MULTI_SELECT", options)).toEqual({ ok: true, clear: true });
  });

  // The one place "empty" is a value rather than an absence.
  it("keeps CHECKBOX false as a real value", () => {
    const result = coerceValue(false, "CHECKBOX", []);
    expect(result).toMatchObject({ ok: true });
    expect((result as { value: { valueBool: boolean } }).value.valueBool).toBe(false);
  });
});

describe("type enforcement (BR-9)", () => {
  it("rejects text in a NUMBER", () => {
    expect(coerceValue("abc", "NUMBER", [])).toMatchObject({ ok: false });
  });

  it("accepts a numeric string, because that is what a number input sends", () => {
    expect(coerceValue("42.5", "NUMBER", [])).toMatchObject({
      ok: true,
      value: { valueNumber: 42.5 },
    });
  });

  it.each([Infinity, NaN])("rejects %p", (raw) => {
    expect(coerceValue(raw, "NUMBER", [])).toMatchObject({ ok: false });
  });

  it("rejects an unparseable DATE", () => {
    expect(coerceValue("not-a-date", "DATE", [])).toMatchObject({ ok: false });
  });

  it("rejects a non-boolean CHECKBOX", () => {
    expect(coerceValue("yes", "CHECKBOX", [])).toMatchObject({ ok: false });
  });
});

// A URL field renders as an anchor, so it is the same XSS surface as a comment
// link — allowlist, not denylist.
describe("URL safety", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>",
    "ftp://example.com",
    "example.com",
  ])("rejects %s", (raw) => {
    expect(coerceValue(raw, "URL", [])).toMatchObject({ ok: false });
  });

  it.each(["https://example.com", "http://example.com/a?b=c"])("accepts %s", (raw) => {
    expect(coerceValue(raw, "URL", [])).toMatchObject({ ok: true });
  });
});

describe("options belong to their own field", () => {
  it("accepts an option this field owns", () => {
    expect(coerceValue("o1", "SELECT", options)).toMatchObject({
      ok: true,
      value: { optionIds: ["o1"] },
    });
  });

  it("rejects an option id from a different field", () => {
    expect(coerceValue("other-field-option", "SELECT", options)).toMatchObject({ ok: false });
  });

  it("rejects a multi-select containing one foreign option", () => {
    expect(coerceValue(["o1", "nope"], "MULTI_SELECT", options)).toMatchObject({ ok: false });
  });

  it("de-duplicates multi-select ids", () => {
    expect(coerceValue(["o1", "o1", "o2"], "MULTI_SELECT", options)).toMatchObject({
      ok: true,
      value: { optionIds: ["o1", "o2"] },
    });
  });
});

describe("readValue", () => {
  const row = {
    valueText: null,
    valueNumber: null,
    valueDate: null,
    valueBool: null,
    valueUserId: null,
    optionIds: [] as string[],
  };

  it("returns null when there is no row at all", () => {
    expect(readValue(null, "TEXT")).toBeNull();
  });

  it("converts Prisma's Decimal to a real number", () => {
    // Prisma hands back a Decimal-like object; JSON would serialise it as an
    // object, not a number, if it were passed through untouched.
    const decimalLike = { toString: () => "12.5", valueOf: () => 12.5 };
    expect(readValue({ ...row, valueNumber: decimalLike }, "NUMBER")).toBe(12.5);
  });

  it("returns the first option id for SELECT and the array for MULTI_SELECT", () => {
    expect(readValue({ ...row, optionIds: ["o2"] }, "SELECT")).toBe("o2");
    expect(readValue({ ...row, optionIds: ["o1", "o2"] }, "MULTI_SELECT")).toEqual(["o1", "o2"]);
  });

  it("returns false for an unchecked CHECKBOX rather than null", () => {
    expect(readValue({ ...row, valueBool: false }, "CHECKBOX")).toBe(false);
  });
});
