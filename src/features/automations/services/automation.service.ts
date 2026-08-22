import { AutomationRepository } from "@/features/automations/repositories/automation.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { canManageProject, elevate } from "@/features/authorization/permission";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import { automationActor, type Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import {
  actionsDocumentSchema,
  conditionsDocumentSchema,
  MAX_RULES_PER_PROJECT,
  type CreateAutomationInput,
  type RunLogQuery,
  type UpdateAutomationInput,
} from "@/features/automations/validation/automation.schemas";
import {
  describeRule,
  planRun,
  type AutomationEvent,
  type AutomationIssueFacts,
  type PlanEntry,
} from "@/features/automations/lib/engine";
import type {
  AutomationRuleDto,
  AutomationRunDto,
  AutomationRunOutcomeDto,
  AutomationsDto,
  AutomationTriggerDto,
} from "@/features/automations/types/automation.types";
import type { AutomationRuleRow } from "@/features/automations/repositories/automation.repository";
import { runActions } from "@/features/automations/services/automation-actions";

// Automation rules: administration, and execution after a write (ADR-0050).
//
// RBAC is enforced here, server-side, per the actor's effective project role
// (permission engine, ADR-0024). Business rules from
// docs/02_Modules/31_automations.md.

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // Tenant scope (F-1): a project outside the caller's org is treated as
  // absent — never reveal existence or content across organizations.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
  const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  return { context, role };
}

/**
 * Parse a stored rule document (BR-6).
 *
 * The database holds `conditions` and `actions` as JSON (ADR-0050 §7), so this
 * is the only thing that knows their shape. A document that no longer parses
 * comes back marked `broken` rather than throwing: one malformed rule must not
 * take down the settings page, and it certainly must not be executed on a
 * guess about what its author meant.
 */
export function parseRule(row: AutomationRuleRow): AutomationRuleDto {
  const conditions = conditionsDocumentSchema.safeParse(row.conditions);
  const actions = actionsDocumentSchema.safeParse(row.actions);
  const base = {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger as AutomationTriggerDto,
  };
  if (!conditions.success || !actions.success) {
    const problem = !conditions.success ? "conditions" : "actions";
    return {
      ...base,
      conditions: [],
      actions: [],
      broken: `its ${problem} are not in a shape this version understands`,
    };
  }
  return { ...base, conditions: conditions.data, actions: actions.data };
}

function toRunDto(row: {
  id: string;
  ruleId: string;
  outcome: string;
  detail: string;
  durationMs: number;
  createdAt: Date;
  issueKey: string | null;
  rule: { name: string };
}): AutomationRunDto {
  return {
    id: row.id,
    ruleId: row.ruleId,
    ruleName: row.rule.name,
    issueKey: row.issueKey,
    outcome: row.outcome as AutomationRunOutcomeDto,
    detail: row.detail,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export const AutomationService = {
  /**
   * A project's rules, with each one's last run.
   *
   * Readable by anyone who can see the project (BR-9). Automated behaviour that
   * only admins can explain is worse than no automation: the person asking "why
   * did my ticket move" is rarely the person who built the rule.
   */
  async list(actor: Actor, projectId: string): Promise<AutomationsDto> {
    const { role } = await resolve(projectId, actor);
    const [rows, lastRuns] = await Promise.all([
      AutomationRepository.list(projectId),
      AutomationRepository.lastRunPerRule(projectId),
    ]);
    const byRule = new Map(lastRuns.map((r) => [r.ruleId, r]));
    const rules = rows.map((row) => {
      const rule = parseRule(row);
      const last = byRule.get(row.id);
      return {
        ...rule,
        lastRun: last
          ? toRunDto({ ...last, rule: { name: row.name } })
          : null,
      };
    });
    return { rules, canManage: canManageProject(role) };
  },

  async runLog(
    actor: Actor,
    projectId: string,
    query: RunLogQuery,
  ): Promise<AutomationRunDto[]> {
    await resolve(projectId, actor); // existence + tenant scope (F-1)
    const rows = await AutomationRepository.listRuns(projectId, query);
    return rows.map(toRunDto);
  },

  async create(
    actor: Actor,
    projectId: string,
    input: CreateAutomationInput,
  ): Promise<AutomationRuleDto> {
    const { context } = await this.requireManager(projectId, actor);
    const existing = await AutomationRepository.countForProject(projectId);
    if (existing >= MAX_RULES_PER_PROJECT) {
      throw new ValidationError(
        `This project already has ${MAX_RULES_PER_PROJECT} rules, which is the limit. Delete or disable one first.`,
      );
    }
    const row = await AutomationRepository.create({
      organizationId: context.organizationId,
      projectId,
      name: input.name,
      enabled: input.enabled,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      actorId: actor.userId,
    });
    return parseRule(row);
  },

  async update(
    actor: Actor,
    ruleId: string,
    input: UpdateAutomationInput,
  ): Promise<AutomationRuleDto> {
    const existing = await AutomationRepository.findById(ruleId);
    if (!existing) throw new NotFoundError("Automation rule not found.");
    await this.requireManager(existing.projectId, actor);
    const row = await AutomationRepository.update(
      ruleId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
        ...(input.actions !== undefined ? { actions: input.actions } : {}),
      },
      actor.userId,
    );
    return parseRule(row);
  },

  async delete(actor: Actor, ruleId: string): Promise<void> {
    const existing = await AutomationRepository.findById(ruleId);
    if (!existing) throw new NotFoundError("Automation rule not found.");
    await this.requireManager(existing.projectId, actor);
    await AutomationRepository.softDelete(ruleId, actor.userId);
  },

  /** BR-9: LEAD on the project, or an org ADMIN (ADR-0024). */
  async requireManager(projectId: string, actor: Actor) {
    const resolved = await resolve(projectId, actor);
    if (!canManageProject(resolved.role)) {
      throw new ForbiddenError("Only a project lead can manage automation rules.");
    }
    return resolved;
  },

  /**
   * Run the rules that react to something that just happened (BR-4).
   *
   * Called by the issue services AFTER their write commits, never inside the
   * transaction: an automation may not roll back the action a person took. The
   * whole body is therefore best-effort — anything that escapes is logged and
   * swallowed, because the user's issue has already moved and telling them it
   * failed would be a lie.
   *
   * Synchronous, in the same request (ADR-0050 §5). The cost is honest: a slow
   * rule slows the response, and the caps in §1 bound it. Moving this behind a
   * queue changes nothing for callers (AUT-6).
   *
   * Returns whether a rule actually wrote to the issue, so the caller can
   * re-read before it builds its response. Without that, creating a bug under
   * an "escalate new bugs" rule hands the client the priority the issue had for
   * the few milliseconds before the rule ran — the form closes showing Low on
   * an issue that is already High, and the user reasonably concludes the rule
   * is broken.
   */
  async dispatch(
    actor: Actor,
    event: {
      trigger: AutomationTriggerDto;
      projectId: string;
      organizationId: string;
      issueId: string;
    },
  ): Promise<boolean> {
    try {
      // BR-2, before any IO. A change an automation made produces no plan at
      // all, so a rule can never react to another rule's work — and the common
      // accident ("when status changes, change status") costs one boolean test
      // rather than a cascade.
      if (actor.automation) return false;

      const armed = await AutomationRepository.listArmed(event.projectId, event.trigger);
      if (armed.length === 0) return false;

      const facts = await AutomationRepository.factsFor(event.issueId);
      // Deleted between the write and here. Nothing to reason about, and a rule
      // that acted on it would resurrect a row somebody removed.
      if (!facts) return false;

      const rules = armed.map(parseRule);
      const plan = planRun(
        {
          trigger: event.trigger,
          issue: toFacts(facts),
          causedByAutomation: false,
        },
        rules,
      );
      await this.perform(plan, rules, event, facts);
      // NOTIFY writes a notification, not the issue — a plan of nothing but
      // notifications leaves the caller's row still current.
      return plan.some(
        (entry) =>
          entry.decision === "RUN" && entry.actions.some((a) => a.kind !== "NOTIFY"),
      );
    } catch (error) {
      // ADR-0050 §5: never fail the user's action. Named so a silent outage is
      // greppable rather than merely absent.
      logSwallowed(`automations.dispatch(${event.trigger})`, error);
      // Conservatively "something may have changed": an exception can escape
      // after an action has already been applied, and handing back a row we
      // know might be stale is the worse of the two errors.
      return true;
    }
  },

  /** Apply a plan and write its run log. One row per evaluated rule (BR-5). */
  async perform(
    plan: PlanEntry[],
    rules: AutomationRuleDto[],
    scope: { projectId: string; organizationId: string },
    facts: NonNullable<Awaited<ReturnType<typeof AutomationRepository.factsFor>>>,
  ): Promise<void> {
    if (plan.length === 0) return;
    const byId = new Map(rules.map((r) => [r.id, r]));
    const runs: {
      ruleId: string;
      projectId: string;
      issueId: string | null;
      outcome: AutomationRunOutcomeDto;
      detail: string;
      durationMs: number;
    }[] = [];

    for (const entry of plan) {
      const started = Date.now();
      if (entry.decision === "SKIP") {
        runs.push({
          ruleId: entry.ruleId,
          projectId: scope.projectId,
          issueId: facts.id,
          outcome: "SKIPPED",
          detail: entry.reason,
          durationMs: Date.now() - started,
        });
        continue;
      }
      const rule = byId.get(entry.ruleId);
      const outcome = await runActions({
        // A rule's actions run as the RULE (BR-3), so every `updatedBy`, audit
        // entry and notification names it rather than whoever tripped the
        // trigger. This actor is also what makes the resulting writes inert
        // with respect to further rules (BR-2).
        actor: automationActor(scope.organizationId, {
          id: entry.ruleId,
          name: entry.ruleName,
        }),
        issue: { id: facts.id, key: facts.key, projectId: scope.projectId },
        actions: entry.actions,
        summary: rule ? describeRule(rule) : entry.ruleName,
      });
      runs.push({
        ruleId: entry.ruleId,
        projectId: scope.projectId,
        issueId: facts.id,
        outcome: outcome.outcome,
        detail: outcome.detail,
        durationMs: Date.now() - started,
      });
    }
    await AutomationRepository.recordRuns(runs);
  },
};

function toFacts(
  row: NonNullable<Awaited<ReturnType<typeof AutomationRepository.factsFor>>>,
): AutomationIssueFacts {
  return {
    id: row.id,
    key: row.key,
    type: row.type,
    priority: row.priority,
    statusId: row.statusId,
    statusCategory: row.status,
    assigneeId: row.assigneeId,
    labelIds: row.labelIds,
  };
}

export type { AutomationEvent };
