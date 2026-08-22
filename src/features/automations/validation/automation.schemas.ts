import { z } from "zod";
import { issuePriority, issueType } from "@/features/issues/validation/issue.schemas";
import { statusCategory } from "@/features/workflow/validation/workflow.schemas";
import { AUTOMATION_TRIGGERS } from "@/features/automations/types/automation.types";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/31_automations.md §2.
//
// These are also the ONLY thing standing between a rule document and the
// engine. `conditions` and `actions` are Json columns (ADR-0050 §7), so the
// database cannot police their shape — every read parses them too, and a rule
// that fails to parse is reported broken rather than executed on a guess.

/**
 * Caps (ADR-0050 §1). ClickUp allows 1 trigger / 15 conditions / 6 actions;
 * ours are slightly tighter because a rule nobody can read is a rule nobody can
 * debug, and the per-project ceiling is what stops one project's automation
 * budget from becoming everyone's page-load problem.
 */
export const MAX_CONDITIONS_PER_RULE = 10;
export const MAX_ACTIONS_PER_RULE = 5;
export const MAX_RULES_PER_PROJECT = 20;

const id = z.string().trim().min(1);

/**
 * A non-empty selection.
 *
 * "Type is (nothing)" is not a filter that matches everything — it is a rule
 * somebody half-configured, and saving it would fire actions on every issue in
 * the project. Refused here; the engine treats it as never-holding as well
 * (belt and braces, `isConditionUsable`).
 */
const chosen = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).min(1, "Pick at least one value.").max(20);

export const automationConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TYPE_IS"), types: chosen(issueType) }).strict(),
  z.object({ kind: z.literal("PRIORITY_IS"), priorities: chosen(issuePriority) }).strict(),
  z
    .object({ kind: z.literal("STATUS_CATEGORY_IS"), categories: chosen(statusCategory) })
    .strict(),
  z.object({ kind: z.literal("STATUS_IS"), statusIds: chosen(id) }).strict(),
  // `null` is a legal member: "unassigned" is a real state people build rules
  // around ("when an urgent bug lands unassigned, tell the lead").
  z.object({ kind: z.literal("ASSIGNEE_IS"), userIds: chosen(id.nullable()) }).strict(),
  z.object({ kind: z.literal("HAS_LABEL"), labelIds: chosen(id) }).strict(),
]);

export const automationActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SET_STATUS"), statusId: id }).strict(),
  z.object({ kind: z.literal("ASSIGN"), userId: id.nullable() }).strict(),
  z.object({ kind: z.literal("SET_PRIORITY"), priority: issuePriority }).strict(),
  z
    .object({
      kind: z.literal("ADD_COMMENT"),
      body: z
        .string()
        .trim()
        .min(1, "Write the comment the rule should post.")
        .max(2000, "Keep an automated comment under 2000 characters."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("NOTIFY"),
      target: z.enum(["ASSIGNEE", "REPORTER", "USER"]),
      userId: id.optional(),
    })
    .strict(),
]);

/** The stored document halves, parsed on the way in AND on the way out (BR-6). */
export const conditionsDocumentSchema = z
  .array(automationConditionSchema)
  .max(MAX_CONDITIONS_PER_RULE, `A rule can have at most ${MAX_CONDITIONS_PER_RULE} conditions.`);

// "Notify a specific person" with no person named is the one shape the
// discriminated union cannot express structurally — `kind` is already the
// discriminator, so `target` cannot also be one. Checked here rather than left
// to fail silently at run time on every firing.
const withNamedRecipient = (actions: unknown[], ctx: z.RefinementCtx) => {
  (actions as z.infer<typeof automationActionSchema>[]).forEach((action, index) => {
    if (action.kind === "NOTIFY" && action.target === "USER" && !action.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose who to notify.",
        path: [index, "userId"],
      });
    }
  });
};

const actionList = z
  .array(automationActionSchema)
  .max(MAX_ACTIONS_PER_RULE, `A rule can have at most ${MAX_ACTIONS_PER_RULE} actions.`);

/**
 * A stored document on the way OUT (BR-6).
 *
 * Permits an empty list, unlike the write schema below: a rule saved before an
 * action type was retired should be reported as doing nothing and skipped, not
 * reported as unparseable. The engine treats the empty case as SKIP.
 */
export const actionsDocumentSchema = actionList.superRefine(withNamedRecipient);

/** The same document on the way IN. A rule that does nothing is not a rule. */
export const ruleActionsSchema = actionList
  .min(1, "Add at least one action.")
  .superRefine(withNamedRecipient);

const ruleName = z
  .string()
  .trim()
  .min(1, "Give the rule a name.")
  .max(80, "Keep a rule name under 80 characters.");

export const createAutomationSchema = z
  .object({
    name: ruleName,
    trigger: z.enum(AUTOMATION_TRIGGERS),
    enabled: z.boolean().default(true),
    conditions: conditionsDocumentSchema.default([]),
    // At least one: a rule that does nothing is not a rule, and saving it
    // produces a run log full of "the rule has no actions".
    actions: ruleActionsSchema,
  })
  .strict();

export const updateAutomationSchema = z
  .object({
    name: ruleName.optional(),
    trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
    enabled: z.boolean().optional(),
    conditions: conditionsDocumentSchema.optional(),
    actions: ruleActionsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const runLogQuerySchema = z
  .object({
    ruleId: id.optional(),
    take: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type RunLogQuery = z.infer<typeof runLogQuerySchema>;
