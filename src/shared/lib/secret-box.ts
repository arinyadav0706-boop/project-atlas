import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption at rest for credentials we hold on somebody else's behalf
// (ADR-0054 §3, 35/BR-4).
//
// The asset this protects is a token that can read the company's source code.
// In a plaintext column, a database dump is that credential — and a database
// dump travels: backups, a staging restore, a support export, a screenshot of a
// query result. The key lives in the environment, so none of those carry it.
//
// AES-256-GCM rather than CBC because GCM authenticates. A tampered ciphertext
// must fail loudly: CBC would hand back plausible garbage, and garbage is then
// sent to the git host as a bearer token, which is a worse day than an error.
//
// Deliberately not a managed KMS. ADR-0004 says stay portable, and a cloud KMS
// is the fastest way to bolt this release to one provider. The trade is that
// key custody becomes an operational responsibility — GL-13.

/** `v1` today. The prefix is what lets the key rotate without a migration. */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
/** 96 bits, the size GCM is specified for; longer is not better here. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `CREDENTIAL_ENCRYPTION_KEY ${detail}. Generate one with ` +
        `\`openssl rand -base64 32\` and set it before connecting a git host.`,
    );
    this.name = "EncryptionUnavailableError";
  }
}

/**
 * Read from `process.env` directly rather than through `shared/lib/env`.
 *
 * Two reasons, and the second is the real one. `env` parses the whole schema at
 * import, so anything importing it cannot be unit-tested without a full
 * environment — and this is the one module in the codebase where the tests
 * *are* the assurance. And reading at call time means a rotated key takes
 * effect on the next call rather than the next deploy.
 *
 * The variable is still declared in `env.ts`, so it stays documented and
 * validated alongside every other setting.
 */
function key(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY ?? "";
  if (!raw) throw new EncryptionUnavailableError("is not set");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new EncryptionUnavailableError("is not valid base64");
  }
  // A short key is the failure that matters: base64 decoding is lenient enough
  // that a truncated value yields a short buffer rather than an error, and
  // `createCipheriv` would then throw something unreadable deep in a request.
  if (decoded.length !== KEY_BYTES) {
    throw new EncryptionUnavailableError(
      `decodes to ${decoded.length} bytes, but AES-256 needs exactly ${KEY_BYTES}`,
    );
  }
  return decoded;
}

/**
 * Whether a credential can be stored at all.
 *
 * Checked before starting an OAuth handshake rather than after it: discovering
 * the key is missing *after* somebody has authorised an app means a granted
 * token we cannot keep, and an install to undo by hand.
 */
export function encryptionAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(
    ".",
  );
}

export function open(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4) {
    throw new Error("Stored credential is not in the expected format.");
  }
  const [version, iv, tag, body] = parts as [string, string, string, string];
  if (version !== VERSION) {
    // A future key rotation adds a branch here rather than a migration; until
    // then an unknown version is corruption, not a format to guess at.
    throw new Error(`Stored credential has unknown version "${version}".`);
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // `final()` is what throws on a bad tag, so both calls have to be inside the
  // try — an early return after `update()` would skip the authentication check
  // entirely and hand back unverified plaintext.
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}

/** True when a stored value looks sealed, for asserting we never wrote a raw token. */
export function isSealed(value: string): boolean {
  return value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}
