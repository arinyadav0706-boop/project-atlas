import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { checkRateLimit, enforceRateLimit } from "@/shared/lib/rate-limit";
import { RateLimitRepository } from "@/shared/lib/rate-limit.repository";
import { RateLimitError } from "@/shared/lib/errors";

// Tier 4 — the rate limiter against a REAL Postgres (ADR-0028). Proves the
// atomic counter, the block threshold, window isolation, and expiry purge —
// the actual behaviour the unit tests mock.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "rate_limits"');
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("RateLimitRepository.hit (atomic)", () => {
  it("increments the same key monotonically", async () => {
    const key = "auth:1.2.3.4:a@b.com:0";
    const exp = new Date(Date.now() + 60_000);
    expect(await RateLimitRepository.hit(key, exp)).toBe(1);
    expect(await RateLimitRepository.hit(key, exp)).toBe(2);
    expect(await RateLimitRepository.hit(key, exp)).toBe(3);
  });

  it("counts concurrent hits without losing increments", async () => {
    const key = "search:user:0";
    const exp = new Date(Date.now() + 60_000);
    const counts = await Promise.all(
      Array.from({ length: 20 }, () => RateLimitRepository.hit(key, exp)),
    );
    // Every increment is unique 1..20 — no lost updates under concurrency.
    expect(new Set(counts).size).toBe(20);
    expect(Math.max(...counts)).toBe(20);
  });

  it("purges only expired rows", async () => {
    await RateLimitRepository.hit("live:x:0", new Date(Date.now() + 60_000));
    await RateLimitRepository.hit("stale:x:0", new Date(Date.now() - 60_000));
    await RateLimitRepository.purgeExpired();
    const rows = await prisma.rateLimit.findMany();
    expect(rows.map((r) => r.key)).toEqual(["live:x:0"]);
  });
});

describe("checkRateLimit / enforceRateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const rule = { limit: 3, windowSec: 3600 };
    const id = "blocker";
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push((await checkRateLimit("test", id, rule)).allowed);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("enforceRateLimit throws RateLimitError past the limit", async () => {
    const rule = { limit: 1, windowSec: 3600 };
    await enforceRateLimit("test", "e", rule); // 1st ok
    await expect(enforceRateLimit("test", "e", rule)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("separate identifiers have independent buckets", async () => {
    const rule = { limit: 1, windowSec: 3600 };
    expect((await checkRateLimit("test", "userA", rule)).allowed).toBe(true);
    expect((await checkRateLimit("test", "userB", rule)).allowed).toBe(true);
  });
});
