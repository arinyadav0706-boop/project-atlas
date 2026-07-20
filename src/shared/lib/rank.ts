import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// String fractional ranking (LexoRank-style) for ordering board/backlog cards.
// See ADR-0009. A card's position is a lexicographically-sortable base-62 key;
// a reorder writes a single row and there is no precision ceiling — you can
// always generate a key strictly between two keys, so no rebalance job exists.
//
// The key-generation primitive is deceptively hard at the boundaries (a naive
// midpoint breaks when inserting before the smallest key), so we delegate to
// the proven, zero-dependency `fractional-indexing` library rather than hand-
// rolling it (ADR-0009, rule #8: pure-algorithm dependency, no vendor lock-in).

// A key strictly between `before` and `after`. Pass `null` for an open end:
// (null, first) prepends, (last, null) appends, (null, null) is an empty column.
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

// Append to the end of a column whose current last key is `last` (or empty).
export function rankAppend(last: string | null): string {
  return generateKeyBetween(last, null);
}

// `count` evenly-distributed keys between `before` and `after` — used to seed
// or backfill a whole column in one pass (both ends `null` for a fresh column).
export function ranksBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before, after, count);
}
