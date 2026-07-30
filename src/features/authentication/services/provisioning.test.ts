import { describe, it, expect } from "vitest";
import { canAutoProvisionSsoUser } from "@/features/authentication/services/provisioning";

// Security finding F6: SSO auto-provisioning must FAIL CLOSED.

describe("canAutoProvisionSsoUser", () => {
  it("refuses provisioning when no allowlist is configured (invite-only)", () => {
    expect(canAutoProvisionSsoUser("anyone@gmail.com", [])).toBe(false);
    expect(canAutoProvisionSsoUser("attacker@evil.com", [])).toBe(false);
  });

  it("provisions only emails whose domain is explicitly trusted", () => {
    expect(canAutoProvisionSsoUser("alice@consint.ai", ["consint.ai"])).toBe(true);
    expect(canAutoProvisionSsoUser("mallory@gmail.com", ["consint.ai"])).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(canAutoProvisionSsoUser("Bob@Consint.AI", ["consint.ai"])).toBe(true);
  });

  it("supports multiple trusted domains", () => {
    const domains = ["consint.ai", "acme.com"];
    expect(canAutoProvisionSsoUser("x@acme.com", domains)).toBe(true);
    expect(canAutoProvisionSsoUser("x@other.com", domains)).toBe(false);
  });

  it("handles malformed emails safely (no domain → refuse)", () => {
    expect(canAutoProvisionSsoUser("no-at-sign", ["consint.ai"])).toBe(false);
    expect(canAutoProvisionSsoUser("trailing@", ["consint.ai"])).toBe(false);
  });
});
