import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimitError } from "@/shared/lib/errors";

vi.mock("@/shared/lib/rate-limit.repository", () => ({
  RateLimitRepository: {
    hit: vi.fn(),
    purgeExpired: vi.fn().mockResolvedValue(undefined),
  },
}));

import { RateLimitRepository } from "@/shared/lib/rate-limit.repository";
import {
  checkRateLimit,
  enforceRateLimit,
  clientIp,
  RateLimitRules,
} from "@/shared/lib/rate-limit";

const hit = vi.mocked(RateLimitRepository.hit);

describe("checkRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows while at or under the limit and reports remaining", async () => {
    hit.mockResolvedValueOnce(3);
    const res = await checkRateLimit("auth", "1.2.3.4:a@b.com", {
      limit: 5,
      windowSec: 900,
    });
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(2);
    expect(res.retryAfterSec).toBeGreaterThan(0);
  });

  it("blocks once the count exceeds the limit", async () => {
    hit.mockResolvedValueOnce(6);
    const res = await checkRateLimit("auth", "x", { limit: 5, windowSec: 900 });
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("keys by bucket:identifier:windowStart so windows are independent", async () => {
    hit.mockResolvedValueOnce(1);
    await checkRateLimit("search", "user-1", { limit: 60, windowSec: 60 });
    const key = hit.mock.calls[0]![0];
    expect(key).toMatch(/^search:user-1:\d+$/);
    // windowStart is aligned to the window size (60s → multiple of 60000ms).
    const windowStart = Number(key.split(":")[2]);
    expect(windowStart % 60000).toBe(0);
  });

  it("fails OPEN when the store errors (a limiter outage must not block login)", async () => {
    hit.mockRejectedValueOnce(new Error("db down"));
    const res = await checkRateLimit("auth", "x", RateLimitRules.authAttempt);
    expect(res.allowed).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws RateLimitError with Retry-After seconds when exceeded", async () => {
    hit.mockResolvedValueOnce(999);
    await expect(
      enforceRateLimit("search", "u", { limit: 60, windowSec: 60 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("does not throw while under the limit", async () => {
    hit.mockResolvedValueOnce(1);
    await expect(
      enforceRateLimit("search", "u", { limit: 60, windowSec: 60 }),
    ).resolves.toBeUndefined();
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
