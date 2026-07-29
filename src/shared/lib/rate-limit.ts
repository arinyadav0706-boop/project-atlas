import { RateLimitError } from "@/shared/lib/errors";
import { RateLimitRepository } from "@/shared/lib/rate-limit.repository";

// DB-backed fixed-window rate limiter (ADR-0028). Portable (plain Postgres via
// Prisma), shared across serverless instances, atomic under concurrency.

export type RateLimitRule = {
  // Max requests allowed within the window for a given identifier.
  limit: number;
  // Window length in seconds.
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  // Seconds until the current window resets.
  retryAfterSec: number;
};

// Named buckets so different endpoints have independent counters and tuning.
export const RateLimitRules = {
  // Credential login: per IP+email. Tight — brute force / password spraying.
  authAttempt: { limit: 8, windowSec: 900 } satisfies RateLimitRule, // 8 / 15 min
  // Search: expensive FTS query, per user.
  search: { limit: 60, windowSec: 60 } satisfies RateLimitRule, // 60 / min
  // General authenticated mutations, per user.
  mutation: { limit: 120, windowSec: 60 } satisfies RateLimitRule, // 120 / min
} as const;

// ~1% of calls also sweep expired rows, keeping the table bounded cheaply.
const PURGE_PROBABILITY = 0.01;

// Best-effort client IP for pre-auth limiting. Behind Vercel/any proxy the
// real client is the first entry in x-forwarded-for; fall back to a constant so
// a missing header degrades to a shared (still-limited) bucket rather than none.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

// Check-and-increment. Returns the result; never throws. Fails OPEN on a store
// error (a limiter outage must not take down auth/login), which is logged.
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const key = `${bucket}:${identifier}:${windowStart}`;

  try {
    const count = await RateLimitRepository.hit(key, expiresAt);
    if (Math.random() < PURGE_PROBABILITY) {
      // Fire-and-forget; a purge failure is harmless.
      void RateLimitRepository.purgeExpired().catch(() => {});
    }
    const retryAfterSec = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSec,
    };
  } catch (error) {
    console.error("Rate limiter store error — failing open", error);
    return { allowed: true, remaining: rule.limit, retryAfterSec: 0 };
  }
}

// Same as checkRateLimit but throws RateLimitError (→ 429 + Retry-After) when
// the bucket is exceeded. Use this in Route Handlers wrapped by handleRoute.
export async function enforceRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): Promise<void> {
  const result = await checkRateLimit(bucket, identifier, rule);
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSec);
  }
}
