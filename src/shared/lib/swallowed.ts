/**
 * The one way to record an error that has been deliberately swallowed.
 *
 * A handful of paths in this app must not fail the user's action when they
 * themselves fail: notification fan-out (ADR-0019), the unblock notification
 * (ADR-0046 §6), the rate limiter failing open, feature-flag reads. Swallowing
 * is the right call in each — but a bare `console.error` in a catch block is
 * how a feature ships dead and nobody finds out.
 *
 * That is not hypothetical. `UNBLOCKED` notifications threw on every insert for
 * a commit because the enum value was never migrated, and the catch block ate
 * it (backlog DEP-7). Nothing in the logs said which feature had stopped
 * working, so nothing could have been grepped for.
 *
 * So every swallow goes through here, and emits one line with a stable prefix
 * and a named operation:
 *
 *     [swallowed] notifications.fanOut — Invalid value for enum ...
 *
 * The prefix is the point. It is greppable in a log drain, alertable on a rate,
 * and it names the operation rather than the file — so a spike tells you what
 * has stopped working, not merely that something has.
 *
 * When real error reporting lands (backlog GL-6), this is the single function
 * that grows a Sentry call. Not eight catch blocks.
 */
export function logSwallowed(operation: string, error: unknown): void {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[swallowed] ${operation} — ${detail}`);
  // The stack goes on its own line rather than into the message: the line above
  // is what gets alerted on and it needs to stay one predictable shape.
  if (error instanceof Error && error.stack) console.error(error.stack);
}
