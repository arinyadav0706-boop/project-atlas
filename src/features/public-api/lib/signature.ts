import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Webhook payload signing (ADR-0052 §7). Pure apart from the CSPRNG.
//
// This is the whole security boundary between our servers and a customer's
// endpoint, so it is a separate, directly-testable module rather than three
// lines buried in a delivery service.

export const SIGNATURE_HEADER = "X-Eagles-Signature";
export const TIMESTAMP_HEADER = "X-Eagles-Timestamp";
export const EVENT_HEADER = "X-Eagles-Event";
export const DELIVERY_HEADER = "X-Eagles-Delivery";

/**
 * How far out of step a timestamp may be before the receiver should reject it.
 *
 * Documented as the recommended tolerance rather than enforced by us — we are
 * the sender. Five minutes absorbs ordinary clock skew and a retry, while
 * keeping the window in which a captured request is replayable small.
 */
export const RECOMMENDED_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/**
 * The bytes that get signed: `<timestamp>.<raw body>`.
 *
 * The timestamp is INSIDE the signed material, which is the part most
 * implementations get wrong. Signing only the body means a captured request
 * stays valid forever — the signature travels with it, and replaying it is
 * indistinguishable from the original. Binding a timestamp in lets the receiver
 * reject anything stale.
 *
 * The RAW body, never a re-serialised object: any difference in key order,
 * whitespace or unicode escaping between our serialiser and theirs would break
 * every verification, and it would break it intermittently, which is worse.
 */
export function signedPayload(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export function sign(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(signedPayload(timestamp, rawBody)).digest("hex");
}

/** The header value we send: `sha256=<hex>`, so the algorithm can change later. */
export function signatureHeader(secret: string, timestamp: number, rawBody: string): string {
  return `sha256=${sign(secret, timestamp, rawBody)}`;
}

/**
 * The receiver's half — shipped so the docs can point at real code, and so our
 * own tests verify the recipe we publish rather than a private variant of it.
 */
export function verifySignature(input: {
  secret: string;
  header: string | null;
  timestamp: number;
  rawBody: string;
  now?: number;
  toleranceSeconds?: number;
}): boolean {
  const {
    secret,
    header,
    timestamp,
    rawBody,
    now = Math.floor(Date.now() / 1000),
    toleranceSeconds = RECOMMENDED_TOLERANCE_SECONDS,
  } = input;
  if (!header) return false;
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  const expected = `sha256=${sign(secret, timestamp, rawBody)}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // Length check first: `timingSafeEqual` throws on a mismatch, and a wrong
  // length is a wrong signature either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
