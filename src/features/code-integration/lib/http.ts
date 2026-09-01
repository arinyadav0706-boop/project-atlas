// The one place an outbound request to a git host is made (ADR-0054 §8).
//
// Everything here exists because of one asymmetry: a backfill is the only part
// of EAGLES that can get the whole installation throttled, and a throttled
// installation breaks the webhook path too. The feature would damage the
// feature it was added to complete. So rate limits are obeyed rather than
// survived, and running out of quota is a first-class outcome with its own
// exception type — not an error string somebody has to pattern-match.

/** A provider said "not now". Carries when to come back (35/BR-11). */
export class RateLimitedError extends Error {
  readonly resumeAfter: Date;
  constructor(resumeAfter: Date) {
    super(`Rate limited until ${resumeAfter.toISOString()}.`);
    this.name = "RateLimitedError";
    this.resumeAfter = resumeAfter;
  }
}

/** The provider answered, but not with something we can act on. */
export class ProviderError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** A single request must not hold a scheduler tick open indefinitely. */
const TIMEOUT_MS = 20_000;
/**
 * Stop before the quota is actually gone.
 *
 * Draining to zero means the *next* caller — plausibly a webhook-triggered
 * lookup, not this backfill — is the one that gets refused. Leaving a floor
 * keeps the interactive paths working while a slow walk continues.
 */
const QUOTA_FLOOR = 50;

/**
 * Parse `Retry-After`, which is legally either seconds or an HTTP date.
 *
 * Both forms appear in the wild from both providers. A missing or unparseable
 * value falls back to a minute, which is short enough to feel responsive and
 * long enough not to hammer.
 */
export function retryAfter(header: string | null, now = new Date()): Date {
  if (!header) return new Date(now.getTime() + 60_000);
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now.getTime() + seconds * 1000);
  }
  const asDate = new Date(header);
  if (!Number.isNaN(asDate.getTime())) return asDate;
  return new Date(now.getTime() + 60_000);
}

/**
 * When a response means "you are out of quota", and until when.
 *
 * The two providers spell this three different ways between them:
 *   GitHub  403 or 429 with `x-ratelimit-remaining: 0` and `x-ratelimit-reset`
 *           as a unix timestamp. A 403 with quota left is a real permission
 *           error and must NOT be treated as a pause.
 *   GitLab  429 with `RateLimit-Reset`, or `Retry-After`.
 */
export function rateLimitFrom(response: Response, now = new Date()): Date | null {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset") ?? response.headers.get("ratelimit-reset");

  if (response.status === 429) {
    if (response.headers.get("retry-after")) {
      return retryAfter(response.headers.get("retry-after"), now);
    }
    return resetToDate(reset, now);
  }
  // GitHub's secondary rate limit is a 403, and telling it apart from a genuine
  // authorisation failure is exactly what `remaining` is for.
  if (response.status === 403 && remaining === "0") {
    return resetToDate(reset, now);
  }
  return null;
}

function resetToDate(reset: string | null, now: Date): Date {
  const epoch = Number(reset);
  if (Number.isFinite(epoch) && epoch > 0) {
    // Both providers use seconds. A value that looks like milliseconds is
    // somebody's proxy being creative; treat it as such rather than parking
    // the run until the year 57000.
    const ms = epoch > 1e12 ? epoch : epoch * 1000;
    const at = new Date(ms);
    if (at.getTime() > now.getTime()) return at;
  }
  return new Date(now.getTime() + 60_000);
}

/** True when quota is nearly gone and a well-behaved client should stop. */
export function nearlyOutOfQuota(response: Response): boolean {
  const remaining = Number(
    response.headers.get("x-ratelimit-remaining") ?? response.headers.get("ratelimit-remaining"),
  );
  return Number.isFinite(remaining) && remaining <= QUOTA_FLOOR;
}

export interface ProviderFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Retries on 5xx and network faults. Rate limits are never retried here. */
  attempts?: number;
}

/**
 * One outbound request, with the behaviour every caller needs.
 *
 * Note what this does NOT do: guard the URL. The SSRF decision belongs to the
 * service that owns the connection (35/BR-15) and is made once, when the base
 * URL is set, rather than re-derived on every page of a walk.
 */
export async function providerFetch(
  url: string,
  options: ProviderFetchOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        // No cookies, no redirects to somewhere else's origin carrying our
        // Authorization header.
        redirect: "follow",
      });

      const limited = rateLimitFrom(response);
      // Thrown, not retried: waiting out a rate limit inside a request would
      // hold a scheduler tick open for an hour. The run pauses instead.
      if (limited) throw new RateLimitedError(limited);

      if (response.status >= 500 && attempt < attempts) {
        await backoff(attempt);
        continue;
      }
      if (!response.ok) {
        // The body may contain anything, including a reflected token. Take the
        // status and a short prefix, and never surface it to a user.
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        throw new ProviderError(response.status, `${response.status} ${detail}`);
      }
      return response;
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof ProviderError) throw error;
      lastError = error;
      if (attempt < attempts) {
        await backoff(attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ProviderError(0, `Could not reach the git host: ${String(lastError)}`);
}

function backoff(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
}

/**
 * Follow RFC 5988 `Link: <…>; rel="next"`, which both providers use for paging.
 *
 * Returning the provider's own URL rather than reconstructing one from a page
 * number is what makes a cursor survive: the next-link already encodes whatever
 * the provider needs, including the keyset paging GitLab uses on large sets.
 */
export function nextLink(response: Response): string | null {
  const header = response.headers.get("link");
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part.trim());
    if (match) return match[1]!;
  }
  return null;
}
