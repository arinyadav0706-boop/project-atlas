import { ValidationError } from "@/shared/lib/errors";

// Where the server is allowed to send an outbound request.
//
// Two levels, because two callers want genuinely different answers and
// collapsing them would break one of them:
//
//   `assertPublicUrl`   — outbound webhooks (ADR-0052). The URL comes from a
//                         user, points at the internet, and has no business
//                         reaching anything on our side of the firewall.
//   `assertProviderUrl` — a git host (ADR-0054, 35/BR-15). A self-managed
//                         GitLab at 10.0.4.7 or gitlab.corp.internal is the
//                         deployment this product supports, so the strict guard
//                         would refuse the feature to the people most likely to
//                         want it.
//
// What stays blocked in both: loopback, and the **cloud metadata endpoints**.
// Those are the addresses where sending a request with an Authorization header
// turns into stolen cloud credentials, and no git host lives there.

/** Link-local, and the hostnames the big three answer metadata on. */
const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
  "[fd00:ec2::254]",
  "fd00:ec2::254",
]);

const LOOPBACK =
  /^(localhost|0\.0\.0\.0|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|::1)$/i;

const PRIVATE =
  /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

function parse(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError("That is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ValidationError(`${what} has to be http or https.`);
  }
  return url;
}

function assertNotMetadata(host: string): void {
  // Checked before anything else and never relaxed: this is the one that turns
  // a curiosity into a cloud account compromise.
  if (METADATA_HOSTS.has(host) || host.endsWith(".metadata.internal")) {
    throw new ValidationError("That address is not reachable from here.");
  }
}

/** Strict: the public internet only. Outbound webhooks. */
export function assertPublicUrl(raw: string, what = "A webhook URL"): void {
  const host = parse(raw, what).hostname.toLowerCase();
  assertNotMetadata(host);
  if (
    LOOPBACK.test(host) ||
    PRIVATE.test(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    throw new ValidationError(`${what} can't point at a private or local address.`);
  }
}

/**
 * Relaxed: a git host, which may legitimately be on the corporate network.
 *
 * The trade is deliberate and narrow. An org ADMIN — already the most trusted
 * role — can point a connection at an internal address and have the server make
 * a request to it. What they cannot do is read the response: backfill never
 * echoes a provider body into the UI, and errors are logged rather than
 * returned. So this is a blind request to an address they could almost
 * certainly reach anyway, not an exfiltration channel.
 */
export function assertProviderUrl(raw: string, what = "A git host URL"): void {
  const host = parse(raw, what).hostname.toLowerCase();
  assertNotMetadata(host);
  if (LOOPBACK.test(host) && !loopbackAllowed()) {
    throw new ValidationError(`${what} can't point at this server.`);
  }
}

/**
 * Loopback escape hatch for the fake provider the tests run against.
 *
 * Read at call time and named so it is greppable, because this is precisely the
 * flag that must never be true in production. It is off unless explicitly set,
 * it is not in `.env.example`, and the metadata block above ignores it — the
 * one thing worth stealing stays unreachable either way.
 */
function loopbackAllowed(): boolean {
  return process.env.ALLOW_LOOPBACK_GIT_HOST === "true";
}
