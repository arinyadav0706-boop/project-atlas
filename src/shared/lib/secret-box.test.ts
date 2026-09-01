import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Encryption at rest for provider credentials (ADR-0054 §3).
//
// `env` is parsed once at import, so each test sets the variable and re-imports
// the module rather than mutating a frozen object.

const KEY = randomBytes(32).toString("base64");

async function load(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CREDENTIAL_ENCRYPTION_KEY = key;
  return import("./secret-box");
}

const original = process.env.CREDENTIAL_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (original === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CREDENTIAL_ENCRYPTION_KEY = original;
  vi.resetModules();
});

describe("sealing and opening", () => {
  it("round-trips a token", async () => {
    const { seal, open } = await load(KEY);
    const token = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
    expect(open(seal(token))).toBe(token);
  });

  it("round-trips unicode and an empty string", async () => {
    const { seal, open } = await load(KEY);
    expect(open(seal("naïve—token·✓"))).toBe("naïve—token·✓");
    expect(open(seal(""))).toBe("");
  });

  it("produces a different ciphertext every time for the same input", async () => {
    // A deterministic ciphertext would leak that two connections share a token,
    // and with GCM a repeated IV is catastrophic rather than merely untidy.
    const { seal } = await load(KEY);
    const a = seal("same");
    const b = seal("same");
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("never contains the plaintext", async () => {
    const { seal } = await load(KEY);
    expect(seal("ghs_super_secret_value")).not.toContain("ghs_super_secret_value");
  });

  it("is recognisable as sealed", async () => {
    const { seal, isSealed } = await load(KEY);
    expect(isSealed(seal("x"))).toBe(true);
    // The assertion the repository test leans on: a raw token must not pass.
    expect(isSealed("ghs_16C7e42F292c6912E7710c838347Ae178B4a")).toBe(false);
    expect(isSealed("")).toBe(false);
  });
});

describe("tampering", () => {
  it("refuses a ciphertext whose body was altered", async () => {
    // The reason for GCM over CBC: this must throw, not return garbage. Garbage
    // would be sent to the git host as a bearer token.
    const { seal, open } = await load(KEY);
    const sealed = seal("ghs_real_token");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });

  it("refuses a ciphertext whose auth tag was altered", async () => {
    const { seal, open } = await load(KEY);
    const parts = seal("ghs_real_token").split(".");
    const tag = Buffer.from(parts[2]!, "base64url");
    tag[0] = tag[0]! ^ 0xff;
    parts[2] = tag.toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });

  it("refuses a ciphertext whose IV was swapped for another's", async () => {
    const { seal, open } = await load(KEY);
    const mine = seal("mine").split(".");
    const theirs = seal("theirs").split(".");
    mine[1] = theirs[1]!;
    expect(() => open(mine.join("."))).toThrow();
  });

  it.each([
    ["an empty string", ""],
    ["a raw token", "ghs_not_sealed_at_all"],
    ["too few segments", "v1.aaa.bbb"],
    ["an unknown version", "v9.aaa.bbb.ccc"],
  ])("refuses %s", async (_label, value) => {
    const { open } = await load(KEY);
    expect(() => open(value)).toThrow();
  });

  it("refuses a ciphertext sealed with a different key", async () => {
    const { seal } = await load(KEY);
    const sealed = seal("ghs_real_token");
    const { open } = await load(randomBytes(32).toString("base64"));
    expect(() => open(sealed)).toThrow();
  });
});

describe("key configuration", () => {
  it("reports unavailable when the key is unset", async () => {
    const { encryptionAvailable } = await load("");
    expect(encryptionAvailable()).toBe(false);
  });

  it.each([
    ["a key that is too short", randomBytes(16).toString("base64")],
    ["a key that is too long", randomBytes(64).toString("base64")],
    ["a key that is not base64 of 32 bytes", "hunter2"],
  ])("reports unavailable for %s", async (_label, value) => {
    const { encryptionAvailable } = await load(value);
    expect(encryptionAvailable()).toBe(false);
  });

  it("explains how to generate a key rather than throwing something cryptic", async () => {
    // This message is the entire debugging experience for whoever deploys it.
    const { seal } = await load("");
    expect(() => seal("x")).toThrow(/openssl rand -base64 32/);
  });

  it("names the actual length when the key is the wrong size", async () => {
    const { seal } = await load(randomBytes(16).toString("base64"));
    expect(() => seal("x")).toThrow(/16 bytes/);
  });

  it("is available for a well-formed key", async () => {
    const { encryptionAvailable } = await load(KEY);
    expect(encryptionAvailable()).toBe(true);
  });
});
