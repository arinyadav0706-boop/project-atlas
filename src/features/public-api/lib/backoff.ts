// Webhook retry policy (ADR-0052 §8-§9). Pure: given an attempt number, when
// to try again — and when to stop.

/**
 * How many times one event is attempted before it is given up on.
 *
 * Six attempts over roughly two hours covers the failure that actually
 * happens — a deploy, a restart, a brief outage — without pretending we can
 * outlast a weekend. An event nobody accepted in two hours is not going to be
 * useful when it lands on Monday.
 */
export const MAX_ATTEMPTS = 6;

/**
 * Consecutive failed DELIVERIES before the webhook itself is switched off.
 *
 * Ten, matching the common convention. Counted across events rather than
 * within one, because the signal being looked for is "this endpoint is gone",
 * not "this payload was rejected". Reset by any success.
 */
export const MAX_CONSECUTIVE_FAILURES = 10;

/** 1m, 5m, 15m, 30m, 60m — then give up. Doubling from one minute would spend
 *  the first four attempts inside two minutes and the retry budget on a blip
 *  that had not finished happening yet. */
const BACKOFF_MINUTES = [1, 5, 15, 30, 60];

/**
 * When to try again after `attempts` failures, or `null` to stop.
 *
 * Deliberately NOT jittered. Jitter matters when thousands of clients retry
 * against one server at the same instant; here each delivery has its own
 * `nextAttemptAt` already spread by when its event happened, and a
 * deterministic schedule is one somebody debugging a delivery log can predict.
 */
export function nextAttemptAfter(attempts: number, from: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  // `attempts` is the count already made, so attempt 1's wait is the first entry.
  const minutes = BACKOFF_MINUTES[attempts - 1] ?? BACKOFF_MINUTES.at(-1)!;
  return new Date(from.getTime() + minutes * 60_000);
}

/** Whether an HTTP status means "keep trying" or "this will never work". */
export function isRetryable(status: number): boolean {
  // 5xx and 429 are the receiver saying "not now". A 4xx is it saying "not
  // ever" — retrying a 401 or a 404 for two hours just fills their logs and
  // ours. 408 is the exception: a timeout is a "not now" wearing a 4xx.
  if (status === 408 || status === 429) return true;
  return status >= 500;
}
