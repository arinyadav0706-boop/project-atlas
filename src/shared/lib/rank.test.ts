import { describe, expect, it } from "vitest";
import { rankAppend, rankBetween, ranksBetween } from "@/shared/lib/rank";

// ADR-0009: string fractional ranking. These tests pin the properties the
// Board relies on — total order, insert-between-anywhere, and stability under
// heavy repeated insertion at the same boundary (where float indexing fails).

describe("rankBetween", () => {
  it("orders an empty column, then a prepend and an append around it", () => {
    const first = rankBetween(null, null);
    const before = rankBetween(null, first);
    const after = rankBetween(first, null);
    expect(before < first).toBe(true);
    expect(first < after).toBe(true);
  });

  it("produces a key strictly between two adjacent keys", () => {
    const a = rankBetween(null, null);
    const b = rankAppend(a);
    const mid = rankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it("appends after the current last key", () => {
    const a = rankBetween(null, null);
    const b = rankAppend(a);
    expect(a < b).toBe(true);
  });
});

describe("ranksBetween (backfill/seed)", () => {
  it("returns N strictly increasing keys for a fresh column", () => {
    const keys = ranksBetween(null, null, 5);
    expect(keys).toHaveLength(5);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches the byte-for-byte format the SQL backfill reproduces (<=62)", () => {
    // The rank migration backfills existing rows in SQL as 'a' + base62digit;
    // this must equal the library's own output so those keys stay valid inputs.
    const alphabet =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const keys = ranksBetween(null, null, 62);
    keys.forEach((k, i) => expect(k).toBe(`a${alphabet[i]}`));
  });
});

// The property float indexing cannot hold: thousands of random inserts,
// including repeatedly at the same boundary, never exhaust "space".
describe("fuzz: heavy random insertion preserves order and uniqueness", () => {
  it("survives 5000 random inserts with a total, stable order", () => {
    // Model the column as an ordered array of keys; each step inserts between
    // two random neighbours (or at an end) exactly as a reorder would.
    const column: string[] = [rankBetween(null, null)];
    for (let step = 0; step < 5000; step++) {
      const i = Math.floor(Math.random() * (column.length + 1));
      const before = i === 0 ? null : (column[i - 1] ?? null);
      const after = i === column.length ? null : (column[i] ?? null);
      const key = rankBetween(before, after);
      // Newly generated key must sort strictly between its chosen neighbours.
      if (before !== null) expect(before < key).toBe(true);
      if (after !== null) expect(key < after).toBe(true);
      column.splice(i, 0, key);
    }

    // The array order (insertion positions) must equal lexicographic order...
    const sorted = [...column].sort();
    expect(column).toEqual(sorted);
    // ...and every key must be unique.
    expect(new Set(column).size).toBe(column.length);
  });

  it("survives 500 repeated inserts at the smallest boundary (the float killer)", () => {
    let smallest = rankBetween(null, null);
    const seen = new Set([smallest]);
    for (let step = 0; step < 500; step++) {
      const next = rankBetween(null, smallest);
      expect(next < smallest).toBe(true);
      expect(seen.has(next)).toBe(false);
      seen.add(next);
      smallest = next;
    }
  });
});
