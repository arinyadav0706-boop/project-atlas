import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition } from "./issue-workflow";

// The fixed V1 workflow (docs/02_Modules/04_issues.md BR-5).
describe("issue workflow", () => {
  it("allows the documented forward path", () => {
    expect(canTransition("TODO", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_REVIEW", "DONE")).toBe(true);
  });

  it("allows the documented backward moves", () => {
    expect(canTransition("IN_PROGRESS", "TODO")).toBe(true);
    expect(canTransition("IN_REVIEW", "IN_PROGRESS")).toBe(true);
    expect(canTransition("DONE", "IN_REVIEW")).toBe(true);
    expect(canTransition("DONE", "TODO")).toBe(true);
  });

  it("forbids skipping straight between TODO and DONE", () => {
    expect(canTransition("TODO", "DONE")).toBe(false);
    expect(canTransition("TODO", "IN_REVIEW")).toBe(false);
    expect(canTransition("DONE", "IN_PROGRESS")).toBe(false);
  });

  it("treats a no-op (same status) as allowed", () => {
    expect(canTransition("TODO", "TODO")).toBe(true);
  });

  it("lists legal next states", () => {
    expect(allowedTransitions("IN_REVIEW")).toEqual(["IN_PROGRESS", "DONE"]);
    expect(allowedTransitions("TODO")).toEqual(["IN_PROGRESS"]);
  });
});
