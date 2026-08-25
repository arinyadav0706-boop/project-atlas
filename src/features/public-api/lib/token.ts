import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Token format, generation and verification (ADR-0052 §2). Pure apart from the
// CSPRNG: no Prisma, no clock. The security-critical half of the public API is
// twenty lines, and it is twenty lines that must be testable directly.

/**
 * `eag_<publicId>_<secret>`.
 *
 * Three parts, each earning its place:
 *
 * - **`eag_`** makes a leaked token recognisable — to GitHub's secret scanner,
 *   to a log pipeline, to a human reading a paste. GitHub's `ghp_` convention
 *   exists because an unprefixed random string is indistinguishable from noise
 *   and therefore never gets caught.
 * - **`publicId`** turns verification into one indexed point read. Without it,
 *   checking a token means hashing the candidate against every row in the
 *   table, which is O(tokens) on every single API request.
 * - **`secret`** is the only part that is hashed, and the only part never
 *   stored.
 */
export const TOKEN_PREFIX = "eag";

/** 16 bytes → 32 hex chars. Enough that ids never collide; not a secret. */
const PUBLIC_ID_BYTES = 16;
/** 32 bytes → 256 bits of entropy in the half that actually guards anything. */
const SECRET_BYTES = 32;

export interface GeneratedToken {
  /** Shown to the user exactly once (BR-4). */
  plaintext: string;
  publicId: string;
  secretHash: string;
}

export function generateToken(): GeneratedToken {
  const publicId = randomBytes(PUBLIC_ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    plaintext: `${TOKEN_PREFIX}_${publicId}_${secret}`,
    publicId,
    secretHash: hashSecret(secret),
  };
}

/**
 * SHA-256, not bcrypt/argon2 — deliberately, and the opposite of the right
 * answer for passwords.
 *
 * A password is low-entropy and human-chosen, so the hash must be slow to make
 * guessing expensive. This secret is 256 bits from a CSPRNG: there is nothing
 * to guess, brute force is not a threat model, and a deliberately slow hash
 * would instead add ~100ms to every API request — turning the rate limit into
 * a CPU limit. Fast hashing of high-entropy secrets is what GitHub, Stripe and
 * every other token issuer do.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export interface ParsedToken {
  publicId: string;
  secret: string;
}

/** Split a presented token. `null` for anything not in our format. */
export function parseToken(raw: string): ParsedToken | null {
  const trimmed = raw.trim();
  // Split on the FIRST TWO underscores only. base64url's alphabet includes
  // `_` (it is the substitute for `/`), so roughly half of all secrets contain
  // one — a plain `split("_")` would tear those in half and reject a perfectly
  // valid token, intermittently, for no visible reason.
  const first = trimmed.indexOf("_");
  if (first === -1) return null;
  const second = trimmed.indexOf("_", first + 1);
  if (second === -1) return null;

  const prefix = trimmed.slice(0, first);
  const publicId = trimmed.slice(first + 1, second);
  const secret = trimmed.slice(second + 1);

  if (prefix !== TOKEN_PREFIX) return null;
  if (publicId.length !== PUBLIC_ID_BYTES * 2 || !/^[0-9a-f]+$/.test(publicId)) return null;
  if (secret.length === 0) return null;
  return { publicId, secret };
}

/** The bearer token from an `Authorization` header, if there is one. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Constant-time comparison of a presented secret against a stored hash.
 *
 * `===` on the hashes would leak, through timing, how many leading characters
 * a guess got right — which is enough to walk a secret out one character at a
 * time given enough requests.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSecret(secret), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // (very coarse) signal — but both sides are SHA-256, so unequal length only
  // happens with a corrupt row, and false is the right answer for that.
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** The last few characters, for showing which token a row is. Never the secret. */
export function tokenHint(publicId: string): string {
  return publicId.slice(-6);
}
