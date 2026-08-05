import { describe, expect, it } from "vitest";
import { workloadQuerySchema, workloadUserParamsSchema } from "./workload.schemas";

// Regression: these schemas originally used `.cuid()`, which rejected every id
// EAGLES did not mint itself — seeded demo data and anything imported during a
// client migration — so the team picker and the drill-in both 400'd in
// production. Ids are opaque here; the org-scoped lookup is the real guard.

describe("id validation accepts any opaque id", () => {
  it("accepts a cuid", () => {
    const id = "clzq1p2xk0000abcd1234efgh";
    expect(workloadQuerySchema.parse({ teamId: id }).teamId).toBe(id);
    expect(workloadUserParamsSchema.parse({ userId: id }).userId).toBe(id);
  });

  it("accepts a seeded id that is not a cuid", () => {
    expect(workloadQuerySchema.parse({ teamId: "verus-team-eng" }).teamId).toBe("verus-team-eng");
    expect(workloadUserParamsSchema.parse({ userId: "verus-u-000" }).userId).toBe("verus-u-000");
  });

  it("accepts a uuid, as an imported dataset might carry", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(workloadUserParamsSchema.parse({ userId: id }).userId).toBe(id);
  });

  it("treats teamId as optional (no team selected yet)", () => {
    expect(workloadQuerySchema.parse({}).teamId).toBeUndefined();
    expect(workloadQuerySchema.parse({ teamId: undefined }).teamId).toBeUndefined();
  });
});

describe("id validation still rejects junk", () => {
  it("rejects an empty id", () => {
    expect(() => workloadUserParamsSchema.parse({ userId: "" })).toThrow();
    expect(() => workloadQuerySchema.parse({ teamId: "" })).toThrow();
  });

  it("rejects an absurdly long id rather than passing it to the database", () => {
    expect(() => workloadUserParamsSchema.parse({ userId: "x".repeat(65) })).toThrow();
  });

  it("rejects a missing userId", () => {
    expect(() => workloadUserParamsSchema.parse({})).toThrow();
  });
});
