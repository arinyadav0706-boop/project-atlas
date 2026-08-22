import type {
  IssuePriorityDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type { StatusCategoryDto } from "@/features/workflow/types/workflow.types";

// DTOs for Automations (ADR-0050, docs/02_Modules/31_automations.md).
//
// Conditions and actions are DISCRIMINATED UNIONS, deliberately. A rule is
// stored as JSON, so the database cannot police its shape (ADR-0050 §7); what
// replaces that guarantee is Zod at every edge plus these unions, which make a
// new action type a compile error in every place that must handle it — exactly
// the property a table-per-type model would have given, without a migration
// each time.

export const AUTOMATION_TRIGGERS = [
  "ISSUE_CREATED",
  "STATUS_CHANGED",
  "ASSIGNEE_CHANGED",
  "PRIORITY_CHANGED",
] as const;

export type AutomationTriggerDto = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_RUN_OUTCOMES = ["SUCCESS", "SKIPPED", "FAILED"] as const;
export type AutomationRunOutcomeDto = (typeof AUTOMATION_RUN_OUTCOMES)[number];

// ── Conditions ──────────────────────────────────────────────────────────────
// All optional, all ANDed (BR-1). Each carries a LIST rather than one value:
// "type is Bug or Story" is one condition a person can read, where two ORed
// conditions would need a grouping concept the builder does not have.

export type AutomationCondition =
  | { kind: "TYPE_IS"; types: IssueTypeDto[] }
  | { kind: "PRIORITY_IS"; priorities: IssuePriorityDto[] }
  | { kind: "STATUS_CATEGORY_IS"; categories: StatusCategoryDto[] }
  | { kind: "STATUS_IS"; statusIds: string[] }
  /** `null` in the list means "unassigned" — a real state people filter on. */
  | { kind: "ASSIGNEE_IS"; userIds: (string | null)[] }
  | { kind: "HAS_LABEL"; labelIds: string[] };

export type AutomationConditionKind = AutomationCondition["kind"];

// ── Actions ─────────────────────────────────────────────────────────────────
// Run in order (BR-1). Each goes through the service layer, so every existing
// rule still applies (BR-7).

export type AutomationAction =
  | { kind: "SET_STATUS"; statusId: string }
  | { kind: "ASSIGN"; userId: string | null }
  | { kind: "SET_PRIORITY"; priority: IssuePriorityDto }
  | { kind: "ADD_COMMENT"; body: string }
  | { kind: "NOTIFY"; target: "ASSIGNEE" | "REPORTER" | "USER"; userId?: string };

export type AutomationActionKind = AutomationAction["kind"];

export interface AutomationRuleDto {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerDto;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /**
   * Set when the stored document no longer parses (BR-6).
   *
   * A broken rule is surfaced and skipped, never executed on a guess — an
   * automation that half-understands its own configuration is worse than one
   * that admits it cannot run.
   */
  broken?: string;
  lastRun?: AutomationRunDto | null;
}

export interface AutomationRunDto {
  id: string;
  ruleId: string;
  ruleName: string;
  issueKey: string | null;
  outcome: AutomationRunOutcomeDto;
  detail: string;
  durationMs: number;
  createdAt: string;
}

export interface AutomationsDto {
  rules: AutomationRuleDto[];
  /** Whether the viewer may create or edit rules — LEAD or org ADMIN (BR-9). */
  canManage: boolean;
}
