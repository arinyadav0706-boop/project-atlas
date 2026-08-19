import type {
  CustomFieldOptionDto,
  CustomFieldTypeDto,
  CustomFieldValueDto,
} from "@/features/custom-fields/types/custom-field.types";

// The one place that turns an untrusted payload value into a storable one, and
// the one place that turns a stored row back into a DTO value (BR-9).
//
// It lives in `lib/` rather than in a Zod schema because the rules depend on
// the FIELD's type, which the payload does not carry — a schema can validate
// "this is a string", not "this is a valid value for field abc123, which is a
// SELECT owning these four options".
//
// Pure and total: it never throws, it returns a discriminated result. The
// service turns a failure into a 422 with the field's name attached, which is
// the error message a user can actually act on.

/** Exactly one typed column is populated; the rest stay null (ADR-0042 §1). */
export interface StorableValue {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueUserId: string | null;
  optionIds: string[];
}

export type CoerceResult =
  | { ok: true; value: StorableValue }
  /** `clear` means "delete the row" — unset has one representation (BR-10). */
  | { ok: true; clear: true }
  | { ok: false; error: string };

const EMPTY: StorableValue = {
  valueText: null,
  valueNumber: null,
  valueDate: null,
  valueBool: null,
  valueUserId: null,
  optionIds: [],
};

export const MAX_TEXT_LENGTH = 2000;
export const MAX_URL_LENGTH = 2000;

// Same allowlist as comment links: schemes that cannot execute script. A custom
// URL field is rendered as an anchor, so it is the same hazard.
const SAFE_URL = /^https?:\/\/\S+$/i;

function clear(): CoerceResult {
  return { ok: true, clear: true };
}

/**
 * @param raw   the value straight off the request body
 * @param type  the field's declared type
 * @param options the field's own options — a SELECT may only reference these
 */
export function coerceValue(
  raw: unknown,
  type: CustomFieldTypeDto,
  options: CustomFieldOptionDto[],
): CoerceResult {
  // null / undefined / "" all mean "clear it". An empty string is what an
  // emptied text input sends, and storing it would create a second, invisible
  // kind of "no value".
  if (raw === null || raw === undefined || raw === "") return clear();

  switch (type) {
    case "TEXT": {
      if (typeof raw !== "string") return { ok: false, error: "must be text" };
      const text = raw.trim();
      if (text === "") return clear();
      if (text.length > MAX_TEXT_LENGTH) {
        return { ok: false, error: `must be ${MAX_TEXT_LENGTH} characters or fewer` };
      }
      return { ok: true, value: { ...EMPTY, valueText: text } };
    }

    case "URL": {
      if (typeof raw !== "string") return { ok: false, error: "must be a URL" };
      const url = raw.trim();
      if (url === "") return clear();
      if (url.length > MAX_URL_LENGTH) {
        return { ok: false, error: `must be ${MAX_URL_LENGTH} characters or fewer` };
      }
      // The rendered field is a link, so a `javascript:` value here is the same
      // XSS hazard as in a comment. Allowlist, never denylist.
      if (!SAFE_URL.test(url)) {
        return { ok: false, error: "must be a http:// or https:// address" };
      }
      return { ok: true, value: { ...EMPTY, valueText: url } };
    }

    case "NUMBER": {
      // Accept a numeric string too: an <input type="number"> sends one, and
      // rejecting it would mean the UI has to parse before it can save.
      const num = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(num)) return { ok: false, error: "must be a number" };
      return { ok: true, value: { ...EMPTY, valueNumber: num } };
    }

    case "DATE": {
      if (typeof raw !== "string") return { ok: false, error: "must be a date" };
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return { ok: false, error: "must be a valid date" };
      return { ok: true, value: { ...EMPTY, valueDate: date } };
    }

    case "CHECKBOX": {
      if (typeof raw !== "boolean") return { ok: false, error: "must be true or false" };
      // `false` is a real value, not a clear: "we checked, and it is not the
      // case" is different from "nobody has said". Only null/undefined clear.
      return { ok: true, value: { ...EMPTY, valueBool: raw } };
    }

    case "USER": {
      if (typeof raw !== "string") return { ok: false, error: "must be a person" };
      // Membership is checked by the service — this module has no database.
      return { ok: true, value: { ...EMPTY, valueUserId: raw } };
    }

    case "SELECT": {
      if (typeof raw !== "string") return { ok: false, error: "must be one option" };
      if (!options.some((o) => o.id === raw)) {
        return { ok: false, error: "is not one of this field's options" };
      }
      return { ok: true, value: { ...EMPTY, optionIds: [raw] } };
    }

    case "MULTI_SELECT": {
      if (!Array.isArray(raw)) return { ok: false, error: "must be a list of options" };
      if (raw.length === 0) return clear();
      const ids = [...new Set(raw)];
      if (!ids.every((id) => typeof id === "string")) {
        return { ok: false, error: "must be a list of options" };
      }
      const valid = new Set(options.map((o) => o.id));
      if (!ids.every((id) => valid.has(id as string))) {
        return { ok: false, error: "contains an option that isn't on this field" };
      }
      return { ok: true, value: { ...EMPTY, optionIds: ids as string[] } };
    }
  }
}

/** The stored row, back in the shape the client is given. */
export function readValue(
  row: {
    valueText: string | null;
    valueNumber: unknown;
    valueDate: Date | null;
    valueBool: boolean | null;
    valueUserId: string | null;
    optionIds: string[];
  } | null,
  type: CustomFieldTypeDto,
): CustomFieldValueDto {
  if (!row) return null;
  switch (type) {
    case "TEXT":
    case "URL":
      return row.valueText;
    case "NUMBER":
      // Prisma hands back a Decimal object, which does not survive JSON as a
      // number. Converting here keeps the DTO honest about its own type.
      return row.valueNumber === null || row.valueNumber === undefined
        ? null
        : Number(row.valueNumber);
    case "DATE":
      return row.valueDate ? row.valueDate.toISOString() : null;
    case "CHECKBOX":
      return row.valueBool;
    case "USER":
      return row.valueUserId;
    case "SELECT":
      return row.optionIds[0] ?? null;
    case "MULTI_SELECT":
      return row.optionIds;
  }
}
