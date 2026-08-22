import type { AutomationRunOutcome, AutomationTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";

// Automation rules and their run log (ADR-0050). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

const ruleSelect = {
  id: true,
  name: true,
  enabled: true,
  trigger: true,
  conditions: true,
  actions: true,
} as const;

export type AutomationRuleRow = Prisma.AutomationRuleGetPayload<{
  select: typeof ruleSelect;
}>;

export const AutomationRepository = {
  list(projectId: string) {
    return prisma.automationRule.findMany({
      where: { projectId, deletedAt: null },
      select: ruleSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },

  /**
   * The rules that could react to this event.
   *
   * Filtered in SQL by trigger AND enabled rather than in the engine: this runs
   * after every issue write in the product, and a project with twenty rules
   * should not ship nineteen of them across the wire to be discarded. The index
   * is `(projectId, enabled)`.
   */
  listArmed(projectId: string, trigger: AutomationTrigger) {
    return prisma.automationRule.findMany({
      where: { projectId, deletedAt: null, enabled: true, trigger },
      select: ruleSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.automationRule.findFirst({
      where: { id, deletedAt: null },
      select: { ...ruleSelect, projectId: true, organizationId: true },
    });
  },

  countForProject(projectId: string) {
    return prisma.automationRule.count({ where: { projectId, deletedAt: null } });
  },

  create(data: {
    organizationId: string;
    projectId: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: Prisma.InputJsonValue;
    actions: Prisma.InputJsonValue;
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.automationRule.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: ruleSelect,
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      enabled?: boolean;
      trigger?: AutomationTrigger;
      conditions?: Prisma.InputJsonValue;
      actions?: Prisma.InputJsonValue;
    },
    actorId: string,
  ) {
    return prisma.automationRule.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
      select: ruleSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.automationRule.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
      select: { id: true },
    });
  },

  /**
   * The facts a rule reasons about, in one query.
   *
   * Deliberately not `IssueRepository.findDetail`: that pulls the epic, the
   * parent, the reporter and the workflow status for a detail page, and this
   * runs after every write. Six columns and a label join is what a condition
   * can actually see.
   */
  async factsFor(issueId: string) {
    const row = await prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: {
        id: true,
        key: true,
        projectId: true,
        type: true,
        priority: true,
        statusId: true,
        status: true,
        assigneeId: true,
        reporterId: true,
        version: true,
        labels: { select: { labelId: true } },
      },
    });
    if (!row) return null;
    const { labels, ...issue } = row;
    return { ...issue, labelIds: labels.map((l) => l.labelId) };
  },

  recordRun(data: {
    ruleId: string;
    projectId: string;
    issueId: string | null;
    outcome: AutomationRunOutcome;
    detail: string;
    durationMs: number;
  }) {
    return prisma.automationRun.create({ data, select: { id: true } });
  },

  /** Batched: one event can evaluate every rule on a project (BR-5). */
  recordRuns(
    rows: {
      ruleId: string;
      projectId: string;
      issueId: string | null;
      outcome: AutomationRunOutcome;
      detail: string;
      durationMs: number;
    }[],
  ) {
    return prisma.automationRun.createMany({ data: rows });
  },

  /**
   * The run log, newest first.
   *
   * Issue keys are resolved in a second query rather than through a relation:
   * `issueId` is deliberately a bare column, so a run survives the issue it
   * touched being deleted. A run log that loses its history when somebody
   * tidies up the backlog answers none of the questions it exists for.
   */
  async listRuns(projectId: string, options: { ruleId?: string; take: number }) {
    const runs = await prisma.automationRun.findMany({
      where: { projectId, ...(options.ruleId ? { ruleId: options.ruleId } : {}) },
      select: {
        id: true,
        ruleId: true,
        issueId: true,
        outcome: true,
        detail: true,
        durationMs: true,
        createdAt: true,
        rule: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.take,
    });
    const keys = await this.issueKeys(runs.map((r) => r.issueId));
    return runs.map((r) => ({ ...r, issueKey: (r.issueId && keys.get(r.issueId)) ?? null }));
  },

  async issueKeys(ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return new Map();
    const rows = await prisma.issue.findMany({
      where: { id: { in: wanted } },
      select: { id: true, key: true },
    });
    return new Map(rows.map((r) => [r.id, r.key]));
  },

  /**
   * The newest run per rule, for the rule list's "last run" column.
   *
   * A `DISTINCT ON` rather than N queries or a fetch-everything-and-group:
   * twenty rules with a long history each would otherwise be twenty round
   * trips, on a settings page that renders on every visit.
   */
  lastRunPerRule(projectId: string) {
    return prisma.$queryRaw<
      {
        id: string;
        ruleId: string;
        outcome: AutomationRunOutcome;
        detail: string;
        durationMs: number;
        createdAt: Date;
        issueKey: string | null;
      }[]
    >`
      SELECT DISTINCT ON (r."ruleId")
             r."id", r."ruleId", r."outcome", r."detail", r."durationMs", r."createdAt",
             i."key" AS "issueKey"
        FROM "automation_runs" r
        LEFT JOIN "issues" i ON i."id" = r."issueId"
       WHERE r."projectId" = ${projectId}
       ORDER BY r."ruleId", r."createdAt" DESC, r."id" DESC`;
  },
};
