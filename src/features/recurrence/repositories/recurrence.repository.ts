import type { Prisma, RecurrenceFrequency, RecurrenceMode } from "@prisma/client";
import { prisma } from "@/shared/lib/db";

// Recurring issues (ADR-0051). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

const recurrenceSelect = {
  id: true,
  projectId: true,
  organizationId: true,
  name: true,
  active: true,
  mode: true,
  frequency: true,
  interval: true,
  startsOn: true,
  weekdays: true,
  dayOfMonth: true,
  timeOfDay: true,
  timeZone: true,
  skipWeekends: true,
  skipIfOpen: true,
  intervalDays: true,
  title: true,
  description: true,
  type: true,
  priority: true,
  assigneeId: true,
  reporterId: true,
  dueInDays: true,
  nextRunAt: true,
  lastRunAt: true,
  occurrences: true,
  endsOn: true,
  maxOccurrences: true,
  lastError: true,
  assignee: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true } },
} as const;

export type RecurrenceRow = Prisma.RecurringIssueGetPayload<{
  select: typeof recurrenceSelect;
}>;

/** How many of a recurrence's issues the list shows. The record, not a log (§9). */
const RECENT_ISSUES = 5;

export const RecurrenceRepository = {
  list(projectId: string) {
    return prisma.recurringIssue.findMany({
      where: { projectId, deletedAt: null },
      select: recurrenceSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.recurringIssue.findFirst({
      where: { id, deletedAt: null },
      select: recurrenceSelect,
    });
  },

  countForProject(projectId: string) {
    return prisma.recurringIssue.count({ where: { projectId, deletedAt: null } });
  },

  /**
   * The most recent issues each of these recurrences produced.
   *
   * One query for the whole page rather than one per recurrence: a project with
   * twenty recurrences renders on every visit to settings.
   */
  async recentIssues(recurrenceIds: string[]) {
    if (recurrenceIds.length === 0) return new Map<string, IssueStub[]>();
    const rows = await prisma.issue.findMany({
      where: { recurrenceId: { in: recurrenceIds }, deletedAt: null },
      select: { id: true, key: true, title: true, createdAt: true, recurrenceId: true },
      orderBy: { createdAt: "desc" },
      // Bounded overall, then trimmed per recurrence below — the alternative is
      // N queries or an unbounded read of every issue a schedule ever made.
      take: recurrenceIds.length * RECENT_ISSUES,
    });
    const byRecurrence = new Map<string, IssueStub[]>();
    for (const row of rows) {
      if (!row.recurrenceId) continue;
      const bucket = byRecurrence.get(row.recurrenceId) ?? [];
      if (bucket.length < RECENT_ISSUES) bucket.push(row);
      byRecurrence.set(row.recurrenceId, bucket);
    }
    return byRecurrence;
  },

  create(data: Prisma.RecurringIssueUncheckedCreateInput) {
    return prisma.recurringIssue.create({ data, select: recurrenceSelect });
  },

  update(id: string, data: Prisma.RecurringIssueUncheckedUpdateInput) {
    return prisma.recurringIssue.update({ where: { id }, data, select: recurrenceSelect });
  },

  softDelete(id: string, actorId: string) {
    return prisma.recurringIssue.update({
      where: { id },
      // `nextRunAt: null` as well as `deletedAt`: the scheduler reads that
      // column and nothing else, so clearing it is what actually stops the
      // schedule rather than relying on a filter never being forgotten.
      data: { deletedAt: new Date(), active: false, nextRunAt: null, updatedBy: actorId },
      select: { id: true },
    });
  },

  /**
   * Everything due right now, across every project in the deployment.
   *
   * The scheduler tick's only read. Served entirely by the `nextRunAt` index,
   * and cheap when nothing is due — which is almost every tick.
   */
  listDue(now: Date, limit: number) {
    return prisma.recurringIssue.findMany({
      where: { deletedAt: null, active: true, nextRunAt: { not: null, lte: now } },
      select: recurrenceSelect,
      orderBy: { nextRunAt: "asc" },
      take: limit,
    });
  },

  /**
   * Take ownership of one due firing (BR-5).
   *
   * The conditional `nextRunAt` in the WHERE is the whole idempotency story —
   * the same trick as optimistic concurrency (ADR-0011). Two ticks running at
   * once both see the row as due; exactly one of them moves `nextRunAt`, and
   * only that one goes on to create the issue. No lock, no queue, no
   * coordination beyond a single row's conditional write.
   *
   * `ended` is passed rather than inferred from a null `advanceTo`, because the
   * two mean different things: a FIXED_SCHEDULE with nowhere left to go has
   * genuinely finished, while an AFTER_COMPLETION recurrence ALWAYS has a null
   * next run after firing — its next date comes from the completion, not the
   * clock. Inferring one from the other switched every after-completion
   * recurrence off the moment it first fired.
   *
   * Returns whether this caller won.
   */
  async claim(
    id: string,
    expected: Date,
    advanceTo: Date | null,
    ended: boolean,
  ): Promise<boolean> {
    const claimed = await prisma.recurringIssue.updateMany({
      where: { id, nextRunAt: expected, deletedAt: null, active: true },
      data: { nextRunAt: advanceTo, ...(ended ? { active: false } : {}) },
    });
    return claimed.count === 1;
  },

  /** Record the outcome of a firing this caller already claimed. */
  recordRun(id: string, at: Date, outcome: { error?: string; counted: boolean }) {
    return prisma.recurringIssue.update({
      where: { id },
      data: {
        lastRunAt: at,
        // Null rather than leaving the previous error in place: a schedule that
        // has recovered must stop reporting a fault it no longer has.
        lastError: outcome.error ?? null,
        ...(outcome.counted ? { occurrences: { increment: 1 } } : {}),
      },
      select: { id: true, occurrences: true },
    });
  },

  /** End a recurrence that has hit its own limit (BR-11). */
  deactivate(id: string) {
    return prisma.recurringIssue.update({
      where: { id },
      data: { active: false, nextRunAt: null },
      select: { id: true },
    });
  },

  /** Whether this recurrence's last issue is still open (BR-6). */
  async hasOpenIssue(recurrenceId: string): Promise<boolean> {
    const open = await prisma.issue.findFirst({
      // The CATEGORY, not a status name: a project that calls its finished
      // column "Shipped" still counts as closed (30_workflow BR-3).
      where: { recurrenceId, deletedAt: null, status: { not: "DONE" } },
      select: { id: true },
    });
    return open !== null;
  },

  /**
   * The recurrences waiting on this issue's completion (BR-3).
   *
   * Called after every transition into a DONE category, so it is filtered to
   * the one mode that cares and indexed by `recurrenceId` on the issue.
   */
  findAwaitingCompletion(recurrenceId: string) {
    return prisma.recurringIssue.findFirst({
      where: {
        id: recurrenceId,
        deletedAt: null,
        active: true,
        mode: "AFTER_COMPLETION",
      },
      select: recurrenceSelect,
    });
  },

  /**
   * Is this a live user in the same organization?
   *
   * The reporter check (BR-8). Deliberately NOT project membership: an org
   * admin can create an issue in any project without being a member of it
   * (ADR-0024), and `IssueService.create` validates the assignee only. A
   * recurrence stricter than the create path it delegates to would refuse
   * schedules the equivalent manual action allows.
   */
  async isOrgUser(userId: string, organizationId: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return user !== null;
  },

  /** Tag a freshly created issue as this recurrence's work (§9). */
  tagIssue(issueId: string, recurrenceId: string) {
    return prisma.issue.update({
      where: { id: issueId },
      data: { recurrenceId },
      select: { id: true },
    });
  },
};

type IssueStub = {
  id: string;
  key: string;
  title: string;
  createdAt: Date;
  recurrenceId: string | null;
};

export type { RecurrenceFrequency, RecurrenceMode };
