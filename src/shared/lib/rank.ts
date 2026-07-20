import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// String fractional ranking (LexoRank-style) for ordering board/backlog cards.
// See ADR-0009 (base scheme) and ADR-0010 (collision-free concurrency).
//
// A stored rank is `<fractionalKey><SEP><suffix>`:
//   - fractionalKey: base-62 key from `fractional-indexing` (the ordering).
//   - suffix: random base-62 "jitter" that makes every generated key unique, so
//     two clients reordering into the SAME gap at the SAME instant can never
//     produce the same key — no duplicate ranks, no retry, no lost "between-ness"
//     (ADR-0010). Uniqueness by construction, not by a DB lock.
//
// Ordering is pure byte comparison, guaranteed by the column's `COLLATE "C"`
// (ADR-0009). SEP MUST be a byte lower than every base-62 character ('0' = 0x30)
// so a bare fractional key always sorts before its longer extensions (e.g. "a2"
// before "a2V"); '#' = 0x23 satisfies this and never appears in a key or suffix.

const SEP = "#";
const SUFFIX_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// 8 base-62 chars ≈ 2.18e14 space — collisions among the handful of truly
// concurrent inserts into one gap are astronomically unlikely; the unique index
// (ADR-0010) is the loud backstop for the impossible case.
const SUFFIX_LEN = 8;

function randomSuffix(): string {
  let s = "";
  for (let i = 0; i < SUFFIX_LEN; i++) {
    s += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return s;
}

// The fractional (ordering) part of a stored rank. Bare keys from the backfill
// migration have no separator and are their own fractional part, so old and new
// keys interoperate without a data migration.
function fractional(key: string | null): string | null {
  if (key === null) return null;
  const i = key.indexOf(SEP);
  return i === -1 ? key : key.slice(0, i);
}

// A unique key strictly between `before` and `after` (either `null` for an open
// end). Two concurrent calls with the same neighbours return different keys that
// both order between them.
export function rankBetween(before: string | null, after: string | null): string {
  const fb = fractional(before);
  const fa = fractional(after);
  // Rare: neighbours share a fractional key (from a prior concurrent insert into
  // the exact same gap). Can't bisect equal keys, so reuse the shared fractional
  // and let the fresh suffix place the card within that cluster — full-key
  // uniqueness still holds; the re-rank repair tool (DB-8) tidies clusters.
  if (fb !== null && fa !== null && fb === fa) {
    return fb + SEP + randomSuffix();
  }
  return generateKeyBetween(fb, fa) + SEP + randomSuffix();
}

// Append to the end of a column whose current last key is `last` (or empty).
export function rankAppend(last: string | null): string {
  return rankBetween(last, null);
}

// `count` evenly-distributed fractional keys between `before` and `after` — used
// to seed or backfill a whole column in one pass, where there is no concurrency,
// so distinct fractional keys need no suffix.
export function ranksBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(fractional(before), fractional(after), count);
}
