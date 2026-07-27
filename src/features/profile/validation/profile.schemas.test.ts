import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profile.schemas";

// The strict update schema is the structural guarantee behind 16_profile.md
// BR-3/AC-3: privileged fields aren't accepted at all — a crafted request 422s.

describe("updateProfileSchema", () => {
  it("accepts a name-only update (trimmed)", () => {
    const parsed = updateProfileSchema.parse({ name: "  Ada Lovelace  " });
    expect(parsed).toEqual({ name: "Ada Lovelace" });
  });

  it("accepts a notifications-only update", () => {
    expect(updateProfileSchema.parse({ notificationsEnabled: false })).toEqual({
      notificationsEnabled: false,
    });
  });

  it("rejects an empty update (nothing to change)", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty / whitespace name", () => {
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(updateProfileSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects a privileged orgRole field (AC-3)", () => {
    const result = updateProfileSchema.safeParse({ name: "Eve", orgRole: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("rejects isActive / email / avatarUrl injection", () => {
    expect(updateProfileSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: "x@y.com" }).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ name: "Eve", avatarUrl: "http://evil/x.png" }).success,
    ).toBe(false);
  });
});
