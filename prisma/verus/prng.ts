// Deterministic PRNG for the VERUS demo seed (ADR-0033). A fixed seed makes
// every run produce the same company, so demos are reproducible and re-seeding
// is idempotent. Mulberry32 — small, fast, good enough for demo data (never for
// anything security-sensitive).

export class Prng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** A uniformly random element. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick() on empty array");
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** A weighted random element: [value, weight] pairs. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [value, weight] of items) {
      r -= weight;
      if (r < 0) return value;
    }
    return items[items.length - 1]![0];
  }

  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  /** `n` distinct elements (or all, if n exceeds length). */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(n, arr.length));
  }
}
