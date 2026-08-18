import { describe, expect, it } from "vitest";
import {
  isIssueFilterActive,
  issueFilterWhere,
} from "@/features/issues/repositories/issue-filter.repository";

const scope = { projectIds: ["p1", "p2"] };

describe("project scope", () => {
  it("always constrains to the scope it was given", () => {
    expect(issueFilterWhere(scope, {}).projectId).toEqual({ in: ["p1", "p2"] });
  });

  it("ignores projectIds on the filter — scope is the service's job (ADR-0040 §1)", () => {
    // A saved view naming p9 must not reach outside the resolved scope; the
    // intersection happens before this function is called.
    const where = issueFilterWhere(scope, { projectIds: ["p9"] });
    expect(where.projectId).toEqual({ in: ["p1", "p2"] });
  });

  it("excludes soft-deleted issues", () => {
    expect(issueFilterWhere(scope, {}).deletedAt).toBeNull();
  });
});

describe("status and openOnly", () => {
  it("maps openOnly to everything except DONE", () => {
    expect(issueFilterWhere(scope, { openOnly: true }).status).toEqual({ not: "DONE" });
  });

  it("lets an explicit status win over openOnly", () => {
    const where = issueFilterWhere(scope, { openOnly: true, status: "IN_REVIEW" });
    expect(where.status).toBe("IN_REVIEW");
  });

  it("constrains nothing when neither is set", () => {
    expect(issueFilterWhere(scope, {}).status).toBeUndefined();
  });
});

// The tri-state is the reason this is not a truthiness check: `false` is a
// constraint ("unestimated"), not an absent filter.
describe("hasEstimate", () => {
  it("false means no estimate recorded", () => {
    expect(issueFilterWhere(scope, { hasEstimate: false }).estimateMinutes).toBeNull();
  });

  it("true means any estimate", () => {
    expect(issueFilterWhere(scope, { hasEstimate: true }).estimateMinutes).toEqual({
      not: null,
    });
  });

  it("absent leaves estimates alone", () => {
    expect(issueFilterWhere(scope, {}).estimateMinutes).toBeUndefined();
  });
});

describe("isIssueFilterActive", () => {
  it("is false for an empty filter", () => {
    expect(isIssueFilterActive({})).toBe(false);
  });

  it.each([
    ["status", { status: "TODO" as const }],
    ["openOnly", { openOnly: true }],
    ["hasEstimate false", { hasEstimate: false }],
    ["projectIds", { projectIds: ["p1"] }],
    ["search", { search: "login" }],
  ])("is true for %s", (_label, filter) => {
    expect(isIssueFilterActive(filter)).toBe(true);
  });
});
