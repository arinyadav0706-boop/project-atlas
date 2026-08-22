import {
  RecurrenceRepository,
  type RecurrenceRow,
} from "@/features/recurrence/repositories/recurrence.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { canManageProject, elevate } from "@/features/authorization/permission";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import {
  atLocalTimeDaysAhead,
  describeSchedule,
  firstOccurrence,
  nextOccurrence,
  type RecurrenceRule,
} from "@/features/recurrence/lib/schedule";
import {
  MAX_RECURRENCES_PER_PROJECT,
  type CreateRecurrenceInput,
  type UpdateRecurrenceInput,
} from "@/features/recurrence/validation/recurrence.schemas";
import type {
  RecurrenceDto,
  RecurrencesDto,
  SchedulerTickDto,
} from "@/features/recurrence/types/recurrence.types";
import { addDays } from "@/shared/lib/day";


// Recurring issues: administration, and the scheduler tick (ADR-0051).
//
// RBAC is enforced here, server-side, per the actor's effective project role
// (permission engine, ADR-0024). Business rules from
// docs/02_Modules/32_recurring.md.

/** One tick will not fire more than this, however far behind it is. */
const MAX_PER_TICK = 200;

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

/** The row as the pure engine wants it. */
function toRule(row: RecurrenceRow): RecurrenceRule {
  return {
    frequency: row.frequency,
    interval: row.interval,
    startsOn: row.startsOn,
    weekdays: row.weekdays,
    dayOfMonth: row.dayOfMonth,
    timeOfDay: row.timeOfDay,
    timeZone: row.timeZone,
    skipWeekends: row.skipWeekends,
    endsOn: row.endsOn,
  };
}

function toDto(
  row: RecurrenceRow,
  recentIssues: { id: string; key: string; title: string; createdAt: Date }[],
): RecurrenceDto {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    mode: row.mode,
    frequency: row.frequency,
    interval: row.interval,
    startsOn: row.startsOn.toISOString(),
    weekdays: row.weekdays,
    dayOfMonth: row.dayOfMonth,
    timeOfDay: row.timeOfDay,
    timeZone: row.timeZone,
    skipWeekends: row.skipWeekends,
    skipIfOpen: row.skipIfOpen,
    intervalDays: row.intervalDays,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    assignee: row.assignee,
    reporter: row.reporter,
    dueInDays: row.dueInDays,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    occurrences: row.occurrences,
    endsOn: row.endsOn ? row.endsOn.toISOString() : null,
    maxOccurrences: row.maxOccurrences,
    lastError: row.lastError,
    // Resolved server-side so the settings list, the issue page and any future
    // surface cannot disagree about what a schedule says.
    summary:
      row.mode === "AFTER_COMPLETION"
        ? `${row.intervalDays ?? 0} day${row.intervalDays === 1 ? "" : "s"} after the last one is done`
        : describeSchedule(toRule(row)),
    recentIssues: recentIssues.map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

export const RecurrenceService = {
  /** Readable by anyone who can see the project (BR-12). */
  async list(actor: Actor, projectId: string): Promise<RecurrencesDto> {
    const { role } = await resolve(projectId, actor);
    const rows = await RecurrenceRepository.list(projectId);
    const recent = await RecurrenceRepository.recentIssues(rows.map((r) => r.id));
    return {
      items: rows.map((row) => toDto(row, recent.get(row.id) ?? [])),
      canManage: canManageProject(role),
    };
  },

  async create(
    actor: Actor,
    projectId: string,
    input: CreateRecurrenceInput,
    /** Injectable for the same reason `runDue` takes one: a schedule is a
     *  function of the clock, and a test that cannot set the clock can only
     *  assert on dates it computed the same way the code did. */
    now = new Date(),
  ): Promise<RecurrenceDto> {
    const { context } = await this.requireManager(projectId, actor);
    const existing = await RecurrenceRepository.countForProject(projectId);
    if (existing >= MAX_RECURRENCES_PER_PROJECT) {
      throw new ValidationError(
        `This project already has ${MAX_RECURRENCES_PER_PROJECT} recurrences, which is the limit. Delete or pause one first.`,
      );
    }
    const reporterId = input.reporterId ?? actor.userId;
    await this.validatePeople(
      projectId,
      context.organizationId,
      reporterId,
      input.assigneeId,
    );

    const startsOn = new Date(input.startsOn);
    const endsOn = input.endsOn ? new Date(input.endsOn) : null;
    const rule: RecurrenceRule = {
      frequency: input.frequency,
      interval: input.interval,
      startsOn,
      weekdays: input.weekdays,
      dayOfMonth: input.dayOfMonth ?? null,
      timeOfDay: input.timeOfDay,
      timeZone: input.timeZone,
      skipWeekends: input.skipWeekends,
      endsOn,
    };
    // AFTER_COMPLETION has no calendar of its own — the first one is created
    // now, and each subsequent one when the previous is closed. Scheduling it
    // like a fixed rule would produce two competing sources of truth.
    const nextRunAt =
      input.mode === "AFTER_COMPLETION" ? startsOn : firstOccurrence(rule, now);

    const row = await RecurrenceRepository.create({
      organizationId: context.organizationId,
      projectId,
      name: input.name,
      active: true,
      mode: input.mode,
      frequency: input.frequency,
      interval: input.interval,
      startsOn,
      weekdays: input.weekdays,
      dayOfMonth: input.dayOfMonth ?? null,
      timeOfDay: input.timeOfDay,
      timeZone: input.timeZone,
      skipWeekends: input.skipWeekends,
      skipIfOpen: input.skipIfOpen,
      intervalDays: input.intervalDays ?? null,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      reporterId,
      dueInDays: input.dueInDays ?? null,
      endsOn,
      maxOccurrences: input.maxOccurrences ?? null,
      nextRunAt,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
    return toDto(row, []);
  },

  async update(
    actor: Actor,
    recurrenceId: string,
    input: UpdateRecurrenceInput,
    now = new Date(),
  ): Promise<RecurrenceDto> {
    const existing = await RecurrenceRepository.findById(recurrenceId);
    if (!existing) throw new NotFoundError("Recurrence not found.");
    await this.requireManager(existing.projectId, actor);
    if (input.reporterId !== undefined || input.assigneeId !== undefined) {
      await this.validatePeople(
        existing.projectId,
        existing.organizationId,
        input.reporterId ?? existing.reporterId,
        input.assigneeId === undefined ? existing.assigneeId : input.assigneeId,
      );
    }

    const merged: RecurrenceRow = {
      ...existing,
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.startsOn !== undefined ? { startsOn: new Date(input.startsOn) } : {}),
      ...(input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth ?? null } : {}),
      ...(input.timeOfDay !== undefined ? { timeOfDay: input.timeOfDay } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.skipWeekends !== undefined ? { skipWeekends: input.skipWeekends } : {}),
      ...(input.endsOn !== undefined ? { endsOn: input.endsOn ? new Date(input.endsOn) : null } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
    };

    // Any edit to the schedule itself re-derives the next firing. Leaving a
    // stale `nextRunAt` behind would mean changing "every Monday" to "every
    // Friday" still fired once more on Monday, which reads as the edit not
    // having saved.
    const scheduleChanged = [
      "frequency",
      "interval",
      "startsOn",
      "weekdays",
      "dayOfMonth",
      "timeOfDay",
      "timeZone",
      "skipWeekends",
      "endsOn",
      "mode",
    ].some((key) => input[key as keyof UpdateRecurrenceInput] !== undefined);

    const resumed = input.active === true && !existing.active;
    let nextRunAt = existing.nextRunAt;
    if (input.active === false) {
      nextRunAt = null;
    } else if (scheduleChanged || resumed) {
      nextRunAt =
        merged.mode === "AFTER_COMPLETION"
          ? (existing.nextRunAt ?? now)
          : firstOccurrence(toRule(merged), now);
    }

    const row = await RecurrenceRepository.update(recurrenceId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.startsOn !== undefined ? { startsOn: new Date(input.startsOn) } : {}),
      ...(input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth ?? null } : {}),
      ...(input.timeOfDay !== undefined ? { timeOfDay: input.timeOfDay } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.skipWeekends !== undefined ? { skipWeekends: input.skipWeekends } : {}),
      ...(input.skipIfOpen !== undefined ? { skipIfOpen: input.skipIfOpen } : {}),
      ...(input.intervalDays !== undefined ? { intervalDays: input.intervalDays ?? null } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId ?? null } : {}),
      ...(input.reporterId !== undefined ? { reporterId: input.reporterId } : {}),
      ...(input.dueInDays !== undefined ? { dueInDays: input.dueInDays ?? null } : {}),
      ...(input.endsOn !== undefined
        ? { endsOn: input.endsOn ? new Date(input.endsOn) : null }
        : {}),
      ...(input.maxOccurrences !== undefined
        ? { maxOccurrences: input.maxOccurrences ?? null }
        : {}),
      nextRunAt,
      updatedBy: actor.userId,
    });
    const recent = await RecurrenceRepository.recentIssues([row.id]);
    return toDto(row, recent.get(row.id) ?? []);
  },

  async delete(actor: Actor, recurrenceId: string): Promise<void> {
    const existing = await RecurrenceRepository.findById(recurrenceId);
    if (!existing) throw new NotFoundError("Recurrence not found.");
    await this.requireManager(existing.projectId, actor);
    await RecurrenceRepository.softDelete(recurrenceId, actor.userId);
  },

  /** BR-12: LEAD on the project, or an org ADMIN (ADR-0024). */
  async requireManager(projectId: string, actor: Actor) {
    const resolved = await resolve(projectId, actor);
    if (!canManageProject(resolved.role)) {
      throw new ForbiddenError("Only a project lead can manage recurring work.");
    }
    return resolved;
  },

  /**
   * The people named on the template must be real (BR-8, 04_issues BR-3).
   *
   * Two different bars, matching what `IssueService.create` itself enforces:
   * the ASSIGNEE must be a project member, the REPORTER need only be a live
   * user in the organization. An org admin can create an issue in a project
   * they are not a member of (ADR-0024), and a recurrence stricter than the
   * create path it delegates to would refuse schedules the equivalent manual
   * action allows.
   *
   * Checked when the recurrence is SAVED rather than only when it fires, so a
   * typo is a form error now instead of a mysterious `lastError` next Monday.
   */
  async validatePeople(
    projectId: string,
    organizationId: string,
    reporterId: string,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!(await RecurrenceRepository.isOrgUser(reporterId, organizationId))) {
      throw new ValidationError("The reporter has to be an active user in this organisation.");
    }
    if (assigneeId) {
      const assignee = await ProjectService.getMemberRole(projectId, assigneeId);
      if (!assignee) {
        throw new ValidationError("The assignee has to be a member of this project.");
      }
    }
  },

  /**
   * Fire everything due (ADR-0051 §5).
   *
   * Called by whatever cron the host provides, never by a user, so there is no
   * actor and no project scope — this is the one place in the app that
   * legitimately reads across every organization.
   *
   * One issue per recurrence per tick, whatever it missed (BR-4).
   */
  async runDue(now = new Date()): Promise<SchedulerTickDto> {
    const due = await RecurrenceRepository.listDue(now, MAX_PER_TICK);
    const result: SchedulerTickDto = {
      claimed: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const row of due) {
      const scheduledFor = row.nextRunAt;
      if (!scheduledFor) continue;

      // Advance to the next occurrence STRICTLY AFTER NOW, not after the one
      // we are firing. That single choice is the whole no-backfill rule: a
      // scheduler down for three weeks skips to next Monday rather than
      // walking three missed Mondays, one tick at a time (BR-4).
      // AFTER_COMPLETION always advances to null — its next date comes from the
      // completion, not the clock — which is emphatically NOT the same as
      // having ended, so the two are passed separately.
      const byClock = row.mode === "AFTER_COMPLETION";
      const advanceTo = byClock ? null : this.advance(row, now);
      const ended = !byClock && advanceTo === null;

      // BR-5. Exactly one caller wins this, so a retried or overlapping tick
      // cannot create the issue twice.
      const won = await RecurrenceRepository.claim(row.id, scheduledFor, advanceTo, ended);
      if (!won) continue;
      result.claimed++;

      try {
        const outcome = await this.fire(row, now);
        if (outcome.created) {
          result.created++;
          result.details.push(`${row.name}: created ${outcome.created}`);
        } else {
          result.skipped++;
          result.details.push(`${row.name}: ${outcome.reason}`);
        }
      } catch (error) {
        // BR-13. The occurrence fails, the reason is recorded, and the schedule
        // still advances — a permanently stuck recurrence silently producing
        // nothing is worse than a gap somebody can see.
        const why = error instanceof Error ? error.message : String(error);
        result.failed++;
        result.details.push(`${row.name}: FAILED — ${why}`);
        await RecurrenceRepository.recordRun(row.id, now, { error: why, counted: false });
        logSwallowed(`recurrence.fire(${row.id})`, error);
      }
    }
    return result;
  },

  /**
   * Where a fixed schedule goes next, or null if it has run out.
   *
   * `maxOccurrences` is checked against the count this firing will make, so a
   * recurrence limited to 12 goes inactive as the twelfth is created rather
   * than lingering with a next run it will never reach.
   */
  advance(row: RecurrenceRow, now: Date): Date | null {
    if (row.maxOccurrences !== null && row.occurrences + 1 >= row.maxOccurrences) return null;
    return nextOccurrence(toRule(row), now);
  },

  /** Create this occurrence's issue, or say why not. */
  async fire(
    row: RecurrenceRow,
    now: Date,
  ): Promise<{ created: string | null; reason: string }> {
    // BR-6. Fixed schedules only — after-completion cannot overlap by
    // construction.
    if (row.mode === "FIXED_SCHEDULE" && row.skipIfOpen) {
      if (await RecurrenceRepository.hasOpenIssue(row.id)) {
        await RecurrenceRepository.recordRun(row.id, now, { counted: false });
        return { created: null, reason: "skipped, the last one is still open" };
      }
    }

    // BR-7: through the service, so required custom fields, assignee
    // validation, the key counter and the assignment notification all apply.
    // BR-8/§8: as the template's reporter — a real person, not a robot — which
    // also means the new issue trips ISSUE_CREATED automations normally (BR-9).
    const { IssueService } = await import("@/features/issues/services/issue.service");
    const issue = await IssueService.create(
      {
        userId: row.reporterId,
        // The reporter may not be a project LEAD, and a recurrence a lead set
        // up must not stop working because the person it reports as was later
        // demoted. The membership check happens when the recurrence is saved.
        orgRole: "ADMIN",
        organizationId: row.organizationId,
      },
      row.projectId,
      {
        type: row.type,
        title: row.title,
        description: row.description ?? undefined,
        priority: row.priority,
        assigneeId: row.assigneeId,
        dueDate: row.dueInDays !== null ? addDays(now, row.dueInDays).toISOString() : undefined,
      },
    );
    await RecurrenceRepository.tagIssue(issue.id, row.id);
    await RecurrenceRepository.recordRun(row.id, now, { counted: true });
    return { created: issue.key, reason: "created" };
  },

  /**
   * An AFTER_COMPLETION recurrence's issue was just closed (BR-3).
   *
   * Called from the issue service's transition paths, best-effort: a scheduling
   * failure must never fail the status change a person made.
   */
  async onIssueCompleted(issue: { id: string; recurrenceId: string | null }): Promise<void> {
    if (!issue.recurrenceId) return;
    try {
      const row = await RecurrenceRepository.findAwaitingCompletion(issue.recurrenceId);
      if (!row) return;
      // Still open elsewhere? A recurrence has one live instance at a time by
      // construction, but a person can reopen one, and scheduling the next
      // while the previous is back in progress would double up.
      if (await RecurrenceRepository.hasOpenIssue(row.id)) return;
      if (row.maxOccurrences !== null && row.occurrences >= row.maxOccurrences) {
        await RecurrenceRepository.deactivate(row.id);
        return;
      }
      // At the recurrence's own local time, not 90×24h from the click: a
      // schedule should keep the time of day it was configured with.
      const next = atLocalTimeDaysAhead(
        new Date(),
        row.intervalDays ?? 1,
        row.timeOfDay,
        row.timeZone,
      );
      if (row.endsOn && next.getTime() > row.endsOn.getTime()) {
        await RecurrenceRepository.deactivate(row.id);
        return;
      }
      await RecurrenceRepository.update(row.id, { nextRunAt: next });
    } catch (error) {
      logSwallowed(`recurrence.onIssueCompleted(${issue.recurrenceId})`, error);
    }
  },
};
