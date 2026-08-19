import type { CustomFieldTypeDto } from "@/features/custom-fields/types/custom-field.types";

// Filtering by custom fields (ADR-0043).
//
// A predicate is the untrusted half: a field id, an operator, and maybe a
// value. It deliberately does NOT carry the field's type — the server looks
// that up, because a client-supplied type could aim a NUMBER field at the text
// column (ADR-0043 §2).

export type CustomFieldOperator =
  | "eq"
  | "contains"
  | "gt"
  | "lt"
  | "any_of"
  | "is_empty"
  | "is_not_empty";

export interface CustomFieldPredicate {
  fieldId: string;
  op: CustomFieldOperator;
  /** Absent for `is_empty` / `is_not_empty`. `any_of` carries a list. */
  value?: string | string[];
}

/** The same predicate once the server has attached the field's declared type. */
export interface ResolvedPredicate extends CustomFieldPredicate {
  type: CustomFieldTypeDto;
}

// Which operators make sense for which type. `contains` on a checkbox is
// rejected rather than ignored — a filter that silently does nothing is worse
// than one that says no.
const ALLOWED: Record<CustomFieldTypeDto, CustomFieldOperator[]> = {
  TEXT: ["eq", "contains", "is_empty", "is_not_empty"],
  URL: ["eq", "contains", "is_empty", "is_not_empty"],
  NUMBER: ["eq", "gt", "lt", "is_empty", "is_not_empty"],
  DATE: ["eq", "gt", "lt", "is_empty", "is_not_empty"],
  CHECKBOX: ["eq", "is_empty", "is_not_empty"],
  SELECT: ["any_of", "is_empty", "is_not_empty"],
  MULTI_SELECT: ["any_of", "is_empty", "is_not_empty"],
  USER: ["any_of", "is_empty", "is_not_empty"],
};

export function operatorsFor(type: CustomFieldTypeDto): CustomFieldOperator[] {
  return ALLOWED[type];
}

export function isOperatorAllowed(
  type: CustomFieldTypeDto,
  op: CustomFieldOperator,
): boolean {
  return ALLOWED[type].includes(op);
}

/** Operators that take no value at all. */
export function isValueless(op: CustomFieldOperator): boolean {
  return op === "is_empty" || op === "is_not_empty";
}

// ── Query-string codec ──────────────────────────────────────────────────────
//
// `?cf=<fieldId>:<op>` or `?cf=<fieldId>:<op>:<encodedValue>`, repeated.
//
// The value is percent-encoded because it can legitimately contain a colon (a
// URL field), and splitting naively on every colon would truncate it. Splitting
// on the FIRST TWO colons only is the other half of that.

const OPERATORS = new Set<string>([
  "eq",
  "contains",
  "gt",
  "lt",
  "any_of",
  "is_empty",
  "is_not_empty",
]);

export function encodePredicate(p: CustomFieldPredicate): string {
  if (isValueless(p.op)) return `${p.fieldId}:${p.op}`;
  const raw = Array.isArray(p.value) ? p.value.join(",") : (p.value ?? "");
  return `${p.fieldId}:${p.op}:${encodeURIComponent(raw)}`;
}

/** Returns null for anything malformed — a bad link opens unfiltered, not 500. */
export function decodePredicate(raw: string): CustomFieldPredicate | null {
  const firstColon = raw.indexOf(":");
  if (firstColon <= 0) return null;
  const secondColon = raw.indexOf(":", firstColon + 1);

  const fieldId = raw.slice(0, firstColon);
  const op = secondColon === -1 ? raw.slice(firstColon + 1) : raw.slice(firstColon + 1, secondColon);
  if (!OPERATORS.has(op)) return null;

  const operator = op as CustomFieldOperator;
  if (isValueless(operator)) return { fieldId, op: operator };

  if (secondColon === -1) return null; // needs a value and has none
  let value: string;
  try {
    value = decodeURIComponent(raw.slice(secondColon + 1));
  } catch {
    // A malformed percent-escape throws; treat it as a bad link rather than
    // letting it reach the caller.
    return null;
  }
  if (value === "") return null;

  return operator === "any_of"
    ? { fieldId, op: operator, value: value.split(",").filter(Boolean) }
    : { fieldId, op: operator, value };
}
