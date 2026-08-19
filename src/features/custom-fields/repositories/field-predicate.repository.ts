import type { Prisma } from "@prisma/client";
import {
  isOperatorAllowed,
  isValueless,
  type ResolvedPredicate,
} from "@/features/custom-fields/lib/field-predicate";

// Turning resolved custom-field predicates into Prisma `where` clauses
// (ADR-0043 §3, §4).
//
// Named `.repository.ts` because it deals in Prisma types, which the
// architecture confines to that suffix — it holds no queries of its own, the
// same arrangement as `issue-filter.repository.ts`.

/**
 * One clause per predicate — never several conditions inside one `some`.
 *
 * A single `some` asks "is there ONE value row satisfying all of these". Every
 * row belongs to exactly one field, so for two different fields that is never
 * true and the query silently returns nothing. Separate clauses ANDed together
 * ask the right question: "a row for field A matching X, AND a row for field B
 * matching Y". This is the easiest thing in the module to get wrong and the
 * hardest to notice, because the failure is an empty list, not an error.
 */
export function customFieldWhere(
  predicates: ResolvedPredicate[],
): Prisma.IssueWhereInput[] {
  const clauses: Prisma.IssueWhereInput[] = [];

  for (const p of predicates) {
    // An operator the type does not support is dropped rather than guessed at.
    // The service rejects these on the way in; this is the second line of
    // defence for a predicate that came out of a stored view.
    if (!isOperatorAllowed(p.type, p.op)) continue;

    if (p.op === "is_empty") {
      // `none` is correct only because clearing a value DELETES the row
      // (ADR-0042 BR-10). If empty rows were stored this would need a
      // per-type "column is null" test instead.
      clauses.push({ customFieldValues: { none: { fieldId: p.fieldId } } });
      continue;
    }
    if (p.op === "is_not_empty") {
      clauses.push({ customFieldValues: { some: { fieldId: p.fieldId } } });
      continue;
    }

    const match = valueCondition(p);
    if (!match) continue;
    clauses.push({ customFieldValues: { some: { fieldId: p.fieldId, ...match } } });
  }

  return clauses;
}

/** The typed-column condition for one predicate, or null if it cannot be built. */
function valueCondition(p: ResolvedPredicate): Prisma.CustomFieldValueWhereInput | null {
  if (isValueless(p.op)) return null;
  const single = Array.isArray(p.value) ? p.value[0] : p.value;
  const many = Array.isArray(p.value) ? p.value : p.value ? [p.value] : [];

  switch (p.type) {
    case "TEXT":
    case "URL": {
      if (!single) return null;
      return p.op === "contains"
        ? { valueText: { contains: single, mode: "insensitive" } }
        : { valueText: single };
    }

    case "NUMBER": {
      const n = Number(single);
      if (!Number.isFinite(n)) return null;
      if (p.op === "gt") return { valueNumber: { gt: n } };
      if (p.op === "lt") return { valueNumber: { lt: n } };
      return { valueNumber: n };
    }

    case "DATE": {
      if (!single) return null;
      const date = new Date(single);
      if (Number.isNaN(date.getTime())) return null;
      if (p.op === "gt") return { valueDate: { gt: date } };
      if (p.op === "lt") return { valueDate: { lt: date } };
      // `eq` on a date means "that day", not "that instant" — a stored
      // timestamp almost never equals midnight, so a literal equality would
      // match nothing and look broken.
      const end = new Date(date);
      end.setUTCDate(end.getUTCDate() + 1);
      return { valueDate: { gte: startOfUtcDay(date), lt: startOfUtcDay(end) } };
    }

    case "CHECKBOX": {
      if (single !== "true" && single !== "false") return null;
      return { valueBool: single === "true" };
    }

    case "USER": {
      if (many.length === 0) return null;
      return { valueUserId: { in: many } };
    }

    case "SELECT":
    case "MULTI_SELECT": {
      if (many.length === 0) return null;
      // `hasSome`: the issue matches if it holds ANY of the chosen options,
      // which is what a multi-choice filter control means.
      return { optionIds: { hasSome: many } };
    }
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
