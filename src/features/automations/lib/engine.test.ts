import { describe, expect, it } from "vitest";
import {
  conditionHolds,
  describeCondition,
  describeRule,
  isConditionUsable,
  planRun,
  type AutomationEvent,
  type AutomationIssueFacts,
} from "./engine";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRuleDto,
  AutomationTriggerDto,
} from "@/features/automations/types/automation.types";

// The rule engine (ADR-0050 §8). Every question a user will ask about automated
// behaviour — why did this change, why didn't my rule fire, why did it fire
// twice — is answerable here rather than by reproducing a state in a browser.

const issue = (over: Partial<AutomationIssueFacts> = {}): AutomationIssueFacts => ({
  id: "i1",
  key: "VWP-1",
  type: "TASK",
  priority: "MEDIUM",
  statusId: "st-todo",
  statusCategory: "TODO",
  assigneeId: null,
  labelIds: [],
  ...over,
});

const rule = (over: Partial<AutomationRuleDto> = {}): AutomationRuleDto => ({
  id: "r1",
  name: "Rule",
  enabled: true,
  trigger: "STATUS_CHANGED",
  conditions: [],
  actions: [{ kind: "SET_PRIORITY", priority: "HIGH" }],
  ...over,
});

const event = (over: Partial<AutomationEvent> = {}): AutomationEvent => ({
  trigger: "STATUS_CHANGED",
  issue: issue(),
  causedByAutomation: false,
  ...over,
});

describe("matching a trigger", () => {
  it("runs a rule with no conditions on every matching trigger", () => {
    const plan = planRun(event(), [rule()]);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.decision).toBe("RUN");
  });

  it("ignores a rule listening for a different trigger, without logging it", () => {
    // Absent from the plan entirely, not SKIPPED: a rule about assignees has
    // nothing to say about a status change, and logging that non-event on every
    // write would bury the runs that matter.
    const plan = planRun(event({ trigger: "STATUS_CHANGED" }), [
      rule({ trigger: "ASSIGNEE_CHANGED" }),
    ]);
    expect(plan).toHaveLength(0);
  });

  it("ignores a disabled rule entirely (BR-10)", () => {
    expect(planRun(event(), [rule({ enabled: false })])).toHaveLength(0);
  });
});

// BR-2 — the property that makes the whole module safe.
describe("loop protection", () => {
  it("plans NOTHING for a change an automation made", () => {
    // "When status changes, set status" is the first rule anybody builds by
    // accident. It has to be inert, not catastrophic.
    const looping = rule({
      trigger: "STATUS_CHANGED",
      actions: [{ kind: "SET_STATUS", statusId: "st-done" }],
    });
    expect(planRun(event({ causedByAutomation: true }), [looping])).toHaveLength(0);
  });

  it("still plans the FIRST, human-caused run of that same rule", () => {
    const looping = rule({
      trigger: "STATUS_CHANGED",
      actions: [{ kind: "SET_STATUS", statusId: "st-done" }],
    });
    const plan = planRun(event({ causedByAutomation: false }), [looping]);
    expect(plan[0]!.decision).toBe("RUN");
  });

  it("suppresses every rule, not just the one that caused the change", () => {
    // A cascade needs only two rules pointing at each other, so the guard has
    // to be about the EVENT, not about which rule is being considered.
    const plan = planRun(event({ causedByAutomation: true }), [
      rule({ id: "a" }),
      rule({ id: "b", trigger: "STATUS_CHANGED" }),
    ]);
    expect(plan).toHaveLength(0);
  });
});

describe("conditions decide, and say why", () => {
  it("skips with a reason naming the condition that stopped it (BR-5)", () => {
    const plan = planRun(event(), [
      rule({ conditions: [{ kind: "TYPE_IS", types: ["BUG"] }] }),
    ]);
    expect(plan[0]!.decision).toBe("SKIP");
    expect(plan[0]).toMatchObject({ reason: expect.stringContaining("type is bug") });
  });

  it("ANDs conditions — one false is enough to stop it", () => {
    const plan = planRun(event({ issue: issue({ type: "BUG", priority: "LOW" }) }), [
      rule({
        conditions: [
          { kind: "TYPE_IS", types: ["BUG"] },
          { kind: "PRIORITY_IS", priorities: ["HIGHEST"] },
        ],
      }),
    ]);
    expect(plan[0]!.decision).toBe("SKIP");
  });

  it("runs when every condition holds", () => {
    const plan = planRun(event({ issue: issue({ type: "BUG", priority: "HIGHEST" }) }), [
      rule({
        conditions: [
          { kind: "TYPE_IS", types: ["BUG"] },
          { kind: "PRIORITY_IS", priorities: ["HIGHEST"] },
        ],
      }),
    ]);
    expect(plan[0]!.decision).toBe("RUN");
  });

  it("skips a rule with no actions rather than logging a success that did nothing", () => {
    const plan = planRun(event(), [rule({ actions: [] })]);
    expect(plan[0]).toMatchObject({ decision: "SKIP", reason: "The rule has no actions." });
  });

  it("skips a rule whose stored document no longer parses (BR-6)", () => {
    const plan = planRun(event(), [rule({ broken: "unknown action kind" })]);
    expect(plan[0]!.decision).toBe("SKIP");
    expect(plan[0]).toMatchObject({ reason: expect.stringContaining("could not be read") });
  });
});

describe("each condition type", () => {
  const check = (c: AutomationCondition, facts: Partial<AutomationIssueFacts>) =>
    conditionHolds(c, issue(facts));

  it("TYPE_IS matches any listed type", () => {
    expect(check({ kind: "TYPE_IS", types: ["BUG", "STORY"] }, { type: "STORY" })).toBe(true);
    expect(check({ kind: "TYPE_IS", types: ["BUG"] }, { type: "TASK" })).toBe(false);
  });

  it("PRIORITY_IS matches any listed priority", () => {
    expect(check({ kind: "PRIORITY_IS", priorities: ["HIGH"] }, { priority: "HIGH" })).toBe(true);
    expect(check({ kind: "PRIORITY_IS", priorities: ["HIGH"] }, { priority: "LOW" })).toBe(false);
  });

  it("STATUS_CATEGORY_IS reasons about the category, not the name (30_workflow BR-3)", () => {
    // A project may call its finished column "Shipped"; the rule still fires.
    expect(
      check({ kind: "STATUS_CATEGORY_IS", categories: ["DONE"] }, {
        statusId: "st-shipped",
        statusCategory: "DONE",
      }),
    ).toBe(true);
  });

  it("STATUS_IS pins one exact status, which a category cannot", () => {
    expect(check({ kind: "STATUS_IS", statusIds: ["st-qa"] }, { statusId: "st-qa" })).toBe(true);
    expect(check({ kind: "STATUS_IS", statusIds: ["st-qa"] }, { statusId: "st-review" })).toBe(
      false,
    );
  });

  it("ASSIGNEE_IS treats null as 'unassigned', which is a real state", () => {
    expect(check({ kind: "ASSIGNEE_IS", userIds: [null] }, { assigneeId: null })).toBe(true);
    expect(check({ kind: "ASSIGNEE_IS", userIds: [null] }, { assigneeId: "u1" })).toBe(false);
    expect(check({ kind: "ASSIGNEE_IS", userIds: ["u1"] }, { assigneeId: "u1" })).toBe(true);
  });

  it("HAS_LABEL matches if ANY listed label is present", () => {
    expect(check({ kind: "HAS_LABEL", labelIds: ["l1", "l2"] }, { labelIds: ["l2"] })).toBe(true);
    expect(check({ kind: "HAS_LABEL", labelIds: ["l1"] }, { labelIds: [] })).toBe(false);
  });
});

// The trap that would fire actions on every issue in a project.
describe("an empty condition is not 'match everything'", () => {
  it("never holds", () => {
    expect(conditionHolds({ kind: "TYPE_IS", types: [] }, issue())).toBe(false);
    expect(conditionHolds({ kind: "HAS_LABEL", labelIds: [] }, issue())).toBe(false);
  });

  it("is reported as unusable so the builder can refuse to save it", () => {
    expect(isConditionUsable({ kind: "TYPE_IS", types: [] })).toBe(false);
    expect(isConditionUsable({ kind: "TYPE_IS", types: ["BUG"] })).toBe(true);
    expect(isConditionUsable({ kind: "ASSIGNEE_IS", userIds: [null] })).toBe(true);
  });
});

describe("actions", () => {
  it("carries them through in the order they were configured (BR-1)", () => {
    const actions: AutomationAction[] = [
      { kind: "ASSIGN", userId: "u1" },
      { kind: "SET_PRIORITY", priority: "HIGHEST" },
      { kind: "ADD_COMMENT", body: "Escalated." },
    ];
    const plan = planRun(event(), [rule({ actions })]);
    expect(plan[0]).toMatchObject({ decision: "RUN", actions });
  });
});

describe("plain-English summaries", () => {
  it("reads as a sentence, which is what makes a list of twenty rules scannable", () => {
    expect(
      describeRule({
        trigger: "STATUS_CHANGED",
        conditions: [{ kind: "TYPE_IS", types: ["BUG"] }],
        actions: [{ kind: "ASSIGN", userId: "u1" }],
      }),
    ).toBe("When status changes → if type is bug → assign it");
  });

  it("says so when a rule has no actions yet", () => {
    expect(
      describeRule({ trigger: "ISSUE_CREATED", conditions: [], actions: [] }),
    ).toBe("When an issue is created → (no actions yet)");
  });

  it("joins a multi-value condition readably", () => {
    expect(
      describeRule({
        trigger: "ISSUE_CREATED",
        conditions: [{ kind: "TYPE_IS", types: ["BUG", "STORY", "TASK"] }],
        actions: [{ kind: "SET_PRIORITY", priority: "HIGH" }],
      }),
    ).toContain("bug, story or task");
  });
});

describe("summaries with real names", () => {
  // A rule list reading "status is one of 2 selected" tells a person nothing.
  // The engine stays pure — it does not look anything up — but it accepts the
  // answer when the caller has it.
  const names = {
    statuses: { "st-qa": "In QA", "st-done": "Shipped" },
    users: { u1: "Priya" },
    labels: { l1: "regression" },
  };

  it("names the status a rule moves to, and the person it assigns", () => {
    expect(
      describeRule(
        {
          trigger: "STATUS_CHANGED",
          conditions: [{ kind: "STATUS_IS", statusIds: ["st-qa"] }],
          actions: [
            { kind: "SET_STATUS", statusId: "st-done" },
            { kind: "ASSIGN", userId: "u1" },
          ],
        },
        names,
      ),
    ).toBe("When status changes → if status is In QA → move it to Shipped, then assign it to Priya");
  });

  it("falls back to a true-but-vague phrase when a name is missing", () => {
    // The run log is written server-side with no name lookup in hand. Better a
    // sentence that is merely unspecific than one that invents a status.
    expect(
      describeRule({
        trigger: "STATUS_CHANGED",
        conditions: [{ kind: "STATUS_IS", statusIds: ["st-qa", "st-done"] }],
        actions: [{ kind: "SET_STATUS", statusId: "st-done" }],
      }),
    ).toBe("When status changes → if status is one of 2 selected statuses → move it to a status");
  });

  it("keeps 'unassigned' readable, and names labels", () => {
    expect(
      describeCondition({ kind: "ASSIGNEE_IS", userIds: [null] }, names),
    ).toBe("the issue is unassigned");
    expect(describeCondition({ kind: "HAS_LABEL", labelIds: ["l1"] }, names)).toBe(
      "it has regression",
    );
  });
});

describe("several rules on one event", () => {
  it("plans each independently, in order", () => {
    const plan = planRun(event({ issue: issue({ type: "BUG" }) }), [
      rule({ id: "a", name: "A", conditions: [{ kind: "TYPE_IS", types: ["BUG"] }] }),
      rule({ id: "b", name: "B", conditions: [{ kind: "TYPE_IS", types: ["STORY"] }] }),
      rule({ id: "c", name: "C" }),
    ]);
    expect(plan.map((p) => [p.ruleId, p.decision])).toEqual([
      ["a", "RUN"],
      ["b", "SKIP"],
      ["c", "RUN"],
    ]);
  });

  it("handles every trigger type", () => {
    const triggers: AutomationTriggerDto[] = [
      "ISSUE_CREATED",
      "STATUS_CHANGED",
      "ASSIGNEE_CHANGED",
      "PRIORITY_CHANGED",
    ];
    for (const t of triggers) {
      const plan = planRun(event({ trigger: t }), [rule({ trigger: t })]);
      expect(plan[0]!.decision).toBe("RUN");
    }
  });
});
