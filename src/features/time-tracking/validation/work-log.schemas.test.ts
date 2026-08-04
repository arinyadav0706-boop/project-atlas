import { describe, it, expect } from "vitest";
import {
  createWorkLogSchema,
  updateWorkLogSchema,
  setEstimateSchema,
} from "@/features/time-tracking/validation/work-log.schemas";

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe("createWorkLogSchema", () => {
  it("accepts a valid log", () => {
    const r = createWorkLogSchema.safeParse({ minutes: 90, workDate: today, note: "did x" });
    expect(r.success).toBe(true);
  });
  it("rejects non-positive or >24h minutes", () => {
    expect(createWorkLogSchema.safeParse({ minutes: 0, workDate: today }).success).toBe(false);
    expect(createWorkLogSchema.safeParse({ minutes: 1441, workDate: today }).success).toBe(false);
    expect(createWorkLogSchema.safeParse({ minutes: 1.5, workDate: today }).success).toBe(false);
  });
  it("rejects a future work date", () => {
    expect(createWorkLogSchema.safeParse({ minutes: 30, workDate: tomorrow }).success).toBe(false);
  });
  it("rejects a malformed date", () => {
    expect(createWorkLogSchema.safeParse({ minutes: 30, workDate: "07/29/2026" }).success).toBe(false);
  });
  it("rejects an over-long note", () => {
    expect(
      createWorkLogSchema.safeParse({ minutes: 30, workDate: today, note: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("updateWorkLogSchema", () => {
  it("requires expectedVersion", () => {
    expect(updateWorkLogSchema.safeParse({ minutes: 30, workDate: today }).success).toBe(false);
    expect(
      updateWorkLogSchema.safeParse({ minutes: 30, workDate: today, expectedVersion: 0 }).success,
    ).toBe(true);
  });
});

describe("setEstimateSchema", () => {
  it("accepts a value or null (clear)", () => {
    expect(setEstimateSchema.safeParse({ estimateMinutes: 480 }).success).toBe(true);
    expect(setEstimateSchema.safeParse({ estimateMinutes: null }).success).toBe(true);
    expect(setEstimateSchema.safeParse({ estimateMinutes: 0 }).success).toBe(true);
  });
  it("rejects negative or absurd estimates", () => {
    expect(setEstimateSchema.safeParse({ estimateMinutes: -1 }).success).toBe(false);
    expect(setEstimateSchema.safeParse({ estimateMinutes: 100001 }).success).toBe(false);
  });
});
