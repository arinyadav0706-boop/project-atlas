import { describe, expect, it } from "vitest";
import {
  bearerFrom,
  generateToken,
  hashSecret,
  parseToken,
  secretMatches,
  tokenHint,
  TOKEN_PREFIX,
} from "./token";
import {
  RECOMMENDED_TOLERANCE_SECONDS,
  generateWebhookSecret,
  sign,
  signatureHeader,
  signedPayload,
  verifySignature,
} from "./signature";

// The security-critical core of the public API (ADR-0052 §2, §7). Everything
// else in the module is plumbing; if these are wrong, nothing above them helps.

describe("token format", () => {
  it("is `eag_<publicId>_<secret>`, and round-trips", () => {
    const token = generateToken();
    expect(token.plaintext.startsWith(`${TOKEN_PREFIX}_`)).toBe(true);

    const parsed = parseToken(token.plaintext)!;
    expect(parsed.publicId).toBe(token.publicId);
    expect(secretMatches(parsed.secret, token.secretHash)).toBe(true);
  });

  it("never stores the secret — only its hash", () => {
    const token = generateToken();
    const secret = parseToken(token.plaintext)!.secret;
    expect(token.secretHash).not.toContain(secret);
    expect(token.secretHash).toBe(hashSecret(secret));
    expect(token.secretHash).toHaveLength(64);
  });

  it("generates a distinct token every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateToken().publicId));
    expect(ids.size).toBe(50);
  });

  it("survives a secret containing an underscore", () => {
    // base64url's alphabet INCLUDES `_` (it substitutes for `/`), so about half
    // of all generated secrets contain one. A naive three-way split tears those
    // in half and rejects a valid token intermittently.
    const publicId = "a".repeat(32);
    const parsed = parseToken(`eag_${publicId}_ab_cd_ef`);
    expect(parsed).toEqual({ publicId, secret: "ab_cd_ef" });
  });

  it("carries a prefix a secret scanner can match on", () => {
    // The reason `ghp_` exists: an unprefixed random string in a commit is
    // indistinguishable from noise, so it is never caught.
    expect(/^eag_[0-9a-f]{32}_/.test(generateToken().plaintext)).toBe(true);
  });
});

describe("parsing a presented token", () => {
  const good = generateToken().plaintext;

  it("accepts a well-formed token", () => {
    expect(parseToken(good)).not.toBeNull();
  });

  it("tolerates surrounding whitespace, which copy-paste adds", () => {
    expect(parseToken(`  ${good}\n`)).not.toBeNull();
  });

  it.each([
    ["empty", ""],
    ["not ours", "ghp_abcdefghijklmnop"],
    ["wrong prefix", good.replace("eag_", "xxx_")],
    ["no secret", `eag_${"a".repeat(32)}_`],
    ["short public id", `eag_${"a".repeat(10)}_secret`],
    ["non-hex public id", `eag_${"z".repeat(32)}_secret`],
    ["just the prefix", "eag_"],
    ["no second separator", `eag_${"a".repeat(32)}`],
  ])("rejects %s", (_label, raw) => {
    expect(parseToken(raw)).toBeNull();
  });
});

describe("verifying a secret", () => {
  it("accepts the right secret and rejects a wrong one", () => {
    const token = generateToken();
    const secret = parseToken(token.plaintext)!.secret;
    expect(secretMatches(secret, token.secretHash)).toBe(true);
    expect(secretMatches(`${secret}x`, token.secretHash)).toBe(false);
    expect(secretMatches("", token.secretHash)).toBe(false);
  });

  it("rejects rather than throwing on a corrupt stored hash", () => {
    // A row somebody hand-edited must fail closed, not 500.
    expect(secretMatches("anything", "not-hex")).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
  });

  it("does not match a secret against another token's hash", () => {
    const a = generateToken();
    const b = generateToken();
    expect(secretMatches(parseToken(a.plaintext)!.secret, b.secretHash)).toBe(false);
  });
});

describe("the Authorization header", () => {
  it.each([
    ["Bearer eag_x", "eag_x"],
    ["bearer eag_x", "eag_x"],
    ["BEARER   eag_x  ", "eag_x"],
  ])("reads %s", (header, expected) => {
    expect(bearerFrom(header)).toBe(expected);
  });

  it.each([null, "", "eag_x", "Basic dXNlcjpwYXNz", "Bearer"])(
    "returns null for %s",
    (header) => {
      expect(bearerFrom(header)).toBeNull();
    },
  );
});

describe("the token hint", () => {
  it("shows enough to identify a row and nothing that helps an attacker", () => {
    const token = generateToken();
    const hint = tokenHint(token.publicId);
    expect(hint).toHaveLength(6);
    expect(token.publicId.endsWith(hint)).toBe(true);
    // It comes off the PUBLIC id — the secret half never appears anywhere.
    expect(token.plaintext.split("_")[2]).not.toContain(hint);
  });
});

// ── Webhook signing ────────────────────────────────────────────────────────

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "issue.created", data: { key: "VWP-1" } });
  const now = 1_800_000_000;

  it("signs `<timestamp>.<raw body>`, not the body alone", () => {
    // The timestamp being INSIDE the signed material is what makes a captured
    // request expire. Signing the body alone leaves it replayable forever.
    expect(signedPayload(now, body)).toBe(`${now}.${body}`);
    expect(sign(secret, now, body)).not.toBe(sign(secret, now + 1, body));
  });

  it("labels the algorithm so it can change later", () => {
    expect(signatureHeader(secret, now, body)).toBe(`sha256=${sign(secret, now, body)}`);
  });

  it("verifies a signature we produced", () => {
    expect(
      verifySignature({
        secret,
        header: signatureHeader(secret, now, body),
        timestamp: now,
        rawBody: body,
        now,
      }),
    ).toBe(true);
  });

  it("rejects a body altered in transit", () => {
    const header = signatureHeader(secret, now, body);
    expect(
      verifySignature({
        secret,
        header,
        timestamp: now,
        rawBody: body.replace("VWP-1", "VWP-2"),
        now,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(
      verifySignature({
        secret,
        header: signatureHeader("whsec_someone_else", now, body),
        timestamp: now,
        rawBody: body,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a REPLAY — the same valid request, sent later", () => {
    // The property the timestamp exists for. Every field is genuine; only the
    // clock has moved on.
    const header = signatureHeader(secret, now, body);
    const later = now + RECOMMENDED_TOLERANCE_SECONDS + 1;
    expect(verifySignature({ secret, header, timestamp: now, rawBody: body, now: later })).toBe(
      false,
    );
    // …and still accepts one that arrives inside the window.
    expect(
      verifySignature({
        secret,
        header,
        timestamp: now,
        rawBody: body,
        now: now + RECOMMENDED_TOLERANCE_SECONDS - 1,
      }),
    ).toBe(true);
  });

  it("rejects a timestamp from the future beyond tolerance, not just the past", () => {
    const header = signatureHeader(secret, now, body);
    expect(
      verifySignature({
        secret,
        header,
        timestamp: now,
        rawBody: body,
        now: now - RECOMMENDED_TOLERANCE_SECONDS - 1,
      }),
    ).toBe(false);
  });

  it.each([null, "", "sha256=", "deadbeef", "sha512=abc"])(
    "rejects a malformed header %s",
    (header) => {
      expect(verifySignature({ secret, header, timestamp: now, rawBody: body, now })).toBe(false);
    },
  );

  it("mints a recognisable, high-entropy secret", () => {
    const s = generateWebhookSecret();
    expect(s.startsWith("whsec_")).toBe(true);
    expect(s.length).toBeGreaterThan(40);
    expect(new Set(Array.from({ length: 20 }, generateWebhookSecret)).size).toBe(20);
  });
});
