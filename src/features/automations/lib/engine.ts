import type {
  AutomationAction,
  AutomationCondition,
  AutomationRuleDto,
  AutomationTriggerDto,
} from "@/features/automations/types/automation.types";
import type {
  IssuePriorityDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type { StatusCategoryDto } from "@/features/workflow/types/workflow.types";

// The rule engine, as a pure module (ADR-0050 §8).
//
// No Prisma, no clock, no IO. Given an event and a set of rules it returns a
// PLAN — which rules matched, which were skipped and why, and what to do. The
// service performs the plan and writes the log.
//
// Pure because this is where "why did my ticket change" lives. Every question a
// user will ever ask about automated behaviour is answerable here, in a unit
// test, rather than by reproducing a state in a browser.

/** The facts about an issue a rule can reason about. */
export interface AutomationIssueFacts {
  id: string;
  key: string;
  type: IssueTypeDto;
  priority: IssuePriorityDto;
  statusId: string;
  statusCategory: StatusCategoryDto;
  assigneeId: string | null;
  labelIds: string[];
}

export interface AutomationEvent {
  trigger: AutomationTriggerDto;
  issue: AutomationIssueFacts;
  /**
   * Whether this event was itself caused by an automation.
   *
   * The loop guard (BR-2). A change made by a rule must not fire further rules:
   * "when status changes, set status" is the first thing anybody builds by
   * accident, and it has to be inert rather than catastrophic.
   */
  causedByAutomation: boolean;
}

export type PlanEntry =
  | { ruleId: string; ruleName: string; decision: "RUN"; actions: AutomationAction[] }
  | { ruleId: string; ruleName: string; decision: "SKIP"; reason: string };

/**
 * Which rules react to this event, and what they would do.
 *
 * Rules the trigger does not match are absent from the plan entirely — a rule
 * about assignees has nothing to say about a status change, and logging that
 * non-event for every rule on every write would bury the runs that matter.
 * Rules that matched and were then stopped ARE in the plan, as SKIP, because
 * "why didn't my rule fire" is the more common question (BR-5).
 */
export function planRun(event: AutomationEvent, rules: AutomationRuleDto[]): PlanEntry[] {
  // BR-2. Checked once, before anything else: an automated change produces no
  // plan at all, so no rule can react to another rule's work.
  if (event.causedByAutomation) return [];

  const plan: PlanEntry[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.trigger !== event.trigger) continue;

    if (rule.broken) {
      plan.push({
        ruleId: rule.id,
        ruleName: rule.name,
        decision: "SKIP",
        reason: `This rule's configuration could not be read (${rule.broken}). Edit it to fix.`,
      });
      continue;
    }

    const failed = rule.conditions.find((c) => !conditionHolds(c, event.issue));
    if (failed) {
      plan.push({
        ruleId: rule.id,
        ruleName: rule.name,
        decision: "SKIP",
        reason: `Condition not met: ${describeCondition(failed)}.`,
      });
      continue;
    }

    if (rule.actions.length === 0) {
      plan.push({
        ruleId: rule.id,
        ruleName: rule.name,
        decision: "SKIP",
        reason: "The rule has no actions.",
      });
      continue;
    }

    plan.push({
      ruleId: rule.id,
      ruleName: rule.name,
      decision: "RUN",
      actions: rule.actions,
    });
  }
  return plan;
}

/** One condition against one issue. Exhaustive by construction. */
export function conditionHolds(
  condition: AutomationCondition,
  issue: AutomationIssueFacts,
): boolean {
  switch (condition.kind) {
    case "TYPE_IS":
      return condition.types.includes(issue.type);
    case "PRIORITY_IS":
      return condition.priorities.includes(issue.priority);
    case "STATUS_CATEGORY_IS":
      return condition.categories.includes(issue.statusCategory);
    case "STATUS_IS":
      return condition.statusIds.includes(issue.statusId);
    case "ASSIGNEE_IS":
      // `null` in the list means unassigned — a real state people filter on,
      // and one an `includes` on a string array would silently never match.
      return condition.userIds.includes(issue.assigneeId);
    case "HAS_LABEL":
      return condition.labelIds.some((id) => issue.labelIds.includes(id));
  }
}

/**
 * An empty list can never hold.
 *
 * "Type is (nothing)" is not a filter that passes everything — it is a rule
 * somebody half-configured, and treating it as "always true" would fire actions
 * on every issue in the project. The builder refuses to save one; this is the
 * belt to that braces.
 */
export function isConditionUsable(condition: AutomationCondition): boolean {
  switch (condition.kind) {
    case "TYPE_IS":
      return condition.types.length > 0;
    case "PRIORITY_IS":
      return condition.priorities.length > 0;
    case "STATUS_CATEGORY_IS":
      return condition.categories.length > 0;
    case "STATUS_IS":
      return condition.statusIds.length > 0;
    case "ASSIGNEE_IS":
      return condition.userIds.length > 0;
    case "HAS_LABEL":
      return condition.labelIds.length > 0;
  }
}

const TRIGGER_TEXT: Record<AutomationTriggerDto, string> = {
  ISSUE_CREATED: "an issue is created",
  STATUS_CHANGED: "status changes",
  ASSIGNEE_CHANGED: "the assignee changes",
  PRIORITY_CHANGED: "priority changes",
};

/**
 * Names for the ids a rule stores, when the caller has them.
 *
 * The engine stays pure — it does not go and look a status up. What it does is
 * accept the answer, so the settings page can read "When status changes → if
 * status is In Review → assign to Priya" while the run log, written server-side
 * with no name lookup in hand, falls back to a shape that is still true.
 */
export interface NameBook {
  statuses?: Record<string, string>;
  users?: Record<string, string>;
  labels?: Record<string, string>;
}

const named = (
  ids: (string | null)[],
  book: Record<string, string> | undefined,
  /** Singular and plural given outright — "statuss" is not a word. */
  noun: [string, string],
): string => {
  const resolved = ids.map((id) => (id === null ? "unassigned" : (book?.[id] ?? null)));
  if (resolved.some((n) => n === null)) {
    const n = ids.length;
    return `one of ${n} selected ${n === 1 ? noun[0] : noun[1]}`;
  }
  return list(resolved as string[], { lower: false });
};

/** Plain English for a condition, for the run log and the rule summary. */
export function describeCondition(
  condition: AutomationCondition,
  names: NameBook = {},
): string {
  switch (condition.kind) {
    case "TYPE_IS":
      return `type is ${list(condition.types)}`;
    case "PRIORITY_IS":
      return `priority is ${list(condition.priorities)}`;
    case "STATUS_CATEGORY_IS":
      return `status category is ${list(condition.categories)}`;
    case "STATUS_IS":
      return `status is ${named(condition.statusIds, names.statuses, ["status", "statuses"])}`;
    case "ASSIGNEE_IS":
      return condition.userIds.length === 1 && condition.userIds[0] === null
        ? "the issue is unassigned"
        : `the assignee is ${named(condition.userIds, names.users, ["person", "people"])}`;
    case "HAS_LABEL":
      return `it has ${named(condition.labelIds, names.labels, ["label", "labels"])}`;
  }
}

/** Plain English for an action. */
export function describeAction(action: AutomationAction, names: NameBook = {}): string {
  switch (action.kind) {
    case "SET_STATUS": {
      const status = names.statuses?.[action.statusId];
      return status ? `move it to ${status}` : "move it to a status";
    }
    case "ASSIGN": {
      if (!action.userId) return "unassign it";
      const user = names.users?.[action.userId];
      return user ? `assign it to ${user}` : "assign it";
    }
    case "SET_PRIORITY":
      return `set priority to ${action.priority.toLowerCase()}`;
    case "ADD_COMMENT":
      return "post a comment";
    case "NOTIFY": {
      if (action.target !== "USER") return `notify the ${action.target.toLowerCase()}`;
      const user = action.userId ? names.users?.[action.userId] : undefined;
      return user ? `notify ${user}` : "notify a chosen person";
    }
  }
}

/**
 * A whole rule as one sentence, for the rule list.
 *
 * The list is where somebody scanning twenty rules decides which one is
 * misbehaving, and "Rule 7" tells them nothing.
 */
export function describeRule(
  rule: {
    trigger: AutomationTriggerDto;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  },
  names: NameBook = {},
): string {
  const when = `When ${TRIGGER_TEXT[rule.trigger]}`;
  const ifs =
    rule.conditions.length > 0
      ? ` → if ${rule.conditions.map((c) => describeCondition(c, names)).join(" and ")}`
      : "";
  const thens =
    rule.actions.length > 0
      ? ` → ${rule.actions.map((a) => describeAction(a, names)).join(", then ")}`
      : " → (no actions yet)";
  return `${when}${ifs}${thens}`;
}

function list(values: string[], options: { lower?: boolean } = {}): string {
  const pretty =
    options.lower === false ? values : values.map((v) => v.toLowerCase().replace(/_/g, " "));
  if (pretty.length <= 1) return pretty[0] ?? "nothing";
  return `${pretty.slice(0, -1).join(", ")} or ${pretty[pretty.length - 1]}`;
}
