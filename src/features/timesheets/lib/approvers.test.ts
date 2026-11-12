import { describe, expect, it } from "vitest";
import { coveredProjectIds, planApprovers, type ApproverInputs } from "./approvers";

// ADR-0059 §6.3 / 37_timesheets BR-29, BR-30 — and above all: nobody ever
// approves their own lines.

const base: ApproverInputs = {
  ownerId: "owner",
  relations: ["REPORTING"],
  reportingManagerId: "mgr",
  functionalManagerId: null,
  projects: [],
  hasLinesWithoutProject: true,
  orgAdminIds: ["admin"],
};

function slots(i: ApproverInputs) {
  const plan = planApprovers(i);
  if (plan.kind !== "SLOTS") throw new Error(`expected slots, got ${plan.kind}`);
  return plan.slots.map((s) => [s.relation, s.projectId, s.approverId, s.fallbackFrom]);
}

describe("default: reporting manager only (Q4)", () => {
  it("asks the team manager", () => {
    expect(slots(base)).toEqual([["REPORTING", null, "mgr", null]]);
  });

  it("falls back to an org admin when there is no team manager (Q5)", () => {
    expect(slots({ ...base, reportingManagerId: null })).toEqual([["REPORTING", null, "admin", "REPORTING"]]);
  });

  it("treats a manager of their own team as having no manager — never self-approval", () => {
    expect(slots({ ...base, ownerId: "mgr", reportingManagerId: "mgr" })).toEqual([["REPORTING", null, "admin", "REPORTING"]]);
  });

  it("auto-approves only when nobody else at all could approve (a one-admin startup)", () => {
    expect(planApprovers({ ...base, ownerId: "admin", reportingManagerId: null, orgAdminIds: ["admin"] })).toEqual({ kind: "AUTO_APPROVE" });
  });

  it("prefers another admin to auto-approval", () => {
    expect(slots({ ...base, ownerId: "a1", reportingManagerId: null, orgAdminIds: ["a1", "a2"] })).toEqual([
      ["REPORTING", null, "a2", "REPORTING"],
    ]);
  });
});

describe("project approval (Q3)", () => {
  const withProject: ApproverInputs = {
    ...base,
    relations: ["REPORTING", "PROJECT"],
    projects: [{ projectId: "p1", leadIds: ["lead1"] }],
  };

  it("adds one slot per project, approved by its lead", () => {
    expect(slots(withProject)).toEqual([
      ["REPORTING", null, "mgr", null],
      ["PROJECT", "p1", "lead1", null],
    ]);
  });

  it("routes a lead's own lines to another lead", () => {
    expect(slots({ ...withProject, ownerId: "lead1", projects: [{ projectId: "p1", leadIds: ["lead1", "lead2"] }] })).toContainEqual(
      ["PROJECT", "p1", "lead2", null],
    );
  });

  it("…else to the reporting manager, else to an org admin", () => {
    const solo = { ...withProject, ownerId: "lead1", projects: [{ projectId: "p1", leadIds: ["lead1"] }] };
    expect(slots(solo)).toContainEqual(["PROJECT", "p1", "mgr", "PROJECT"]);
    expect(slots({ ...solo, reportingManagerId: null })).toContainEqual(["PROJECT", "p1", "admin", "PROJECT"]);
  });

  it("still sends project-less lines to the reporting manager when only PROJECT is enabled", () => {
    expect(slots({ ...withProject, relations: ["PROJECT"] })).toEqual([
      ["PROJECT", "p1", "lead1", null],
      ["REPORTING", null, "mgr", null],
    ]);
    expect(slots({ ...withProject, relations: ["PROJECT"], hasLinesWithoutProject: false })).toEqual([
      ["PROJECT", "p1", "lead1", null],
    ]);
  });

  it("scopes a PROJECT-only approver to their project's lines", () => {
    const s = [
      { relation: "REPORTING" as const, projectId: null, approverId: "mgr" },
      { relation: "PROJECT" as const, projectId: "p1", approverId: "lead1" },
    ];
    expect(coveredProjectIds(s, "lead1")).toEqual({ wholeWeek: false, projectIds: new Set(["p1"]) });
    expect(coveredProjectIds(s, "mgr").wholeWeek).toBe(true);
  });
});

describe("functional manager (Q2)", () => {
  it("asks the functional manager when the policy enables it, else an admin", () => {
    expect(slots({ ...base, relations: ["REPORTING", "FUNCTIONAL"], functionalManagerId: "fm" })).toEqual([
      ["REPORTING", null, "mgr", null],
      ["FUNCTIONAL", null, "fm", null],
    ]);
    expect(slots({ ...base, relations: ["FUNCTIONAL"], functionalManagerId: null })).toEqual([
      ["FUNCTIONAL", null, "admin", "FUNCTIONAL"],
    ]);
  });
});
