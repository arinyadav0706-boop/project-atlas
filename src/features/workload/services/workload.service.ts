import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { TeamService } from "@/features/teams/services/team.service";
import { WorkloadRepository } from "@/features/workload/repositories/workload.repository";
import {
  DEFAULT_WORKING_WEEK,
  describeWorkingWeek,
  remainingMinutes,
  weeklyCapacityMinutes,
  weeksOfWork,
  workloadStatus,
  type WorkingWeek,
} from "@/features/workload/lib/capacity";
import { distributeAcrossWeeks } from "@/features/scheduling/lib/distribute";
import { resolveWindow } from "@/features/scheduling/lib/resolve-window";
import { buildHorizon, formatWeekLabel, startOfUtcWeek } from "@/features/scheduling/lib/weeks";
import type {
  WorkloadDto,
  WorkloadGridCellDto,
  WorkloadGridDto,
  WorkloadGridRowDto,
  WorkloadIssueDto,
  WorkloadRowDto,
  WorkloadTotalsDto,
  WorkingWeekDto,
} from "@/features/workload/types/workload.types";

// Business rules: docs/02_Modules/21_workload.md (ADR-0034, ADR-0035). RBAC is
// enforced here, server-side, on every call — the client never decides scope
// (BR-8).

const DRILL_IN_LIMIT = 50;

// Four week columns, fixed (ADR-0035 §3). Twelve would be quarter-planning
// nobody has asked for, on a page that is already dense.
const HORIZON_WEEKS = 4;

const EMPTY_TOTALS = {
  people: 0,
  openIssues: 0,
  unestimated: 0,
  remainingMinutes: 0,
  overloaded: 0,
  idle: 0,
} as const;

// The team ids the caller may inspect. `null` means "every team in the org"
// (an admin holding MANAGE_TEAMS); an array means exactly those teams; an empty
// array means no scope at all (BR-8).
async function resolveScope(actor: Actor): Promise<string[] | null> {
  if (hasCapability(actor, AdminCapability.MANAGE_TEAMS)) return null;
  return TeamService.getManagedTeamIds(actor);
}

// The org's configured week, falling back rather than failing if the row is
// unreadable — a missing setting must never break the whole page.
async function workingWeekFor(organizationId: string): Promise<WorkingWeek> {
  const row = await WorkloadRepository.workingWeek(organizationId);
  if (!row) return DEFAULT_WORKING_WEEK;
  return { minutesPerDay: row.workingMinutesPerDay, daysPerWeek: row.workingDaysPerWeek };
}

function toWorkingWeekDto(week: WorkingWeek): WorkingWeekDto {
  return {
    minutesPerDay: week.minutesPerDay,
    daysPerWeek: week.daysPerWeek,
    weeklyMinutes: weeklyCapacityMinutes(week),
    label: describeWorkingWeek(week),
  };
}

// The week columns: real dates, so a manager recognises the week from their own
// calendar instead of counting forward from "+2 wk" (ADR-0035 §3).
function weekColumns(now: Date, week: WorkingWeek) {
  const thisWeek = startOfUtcWeek(now).getTime();
  return buildHorizon(now, HORIZON_WEEKS).map((start) => ({
    start: start.toISOString(),
    label: formatWeekLabel(start, week.daysPerWeek),
    isCurrent: start.getTime() === thisWeek,
  }));
}

function emptyGrid(now: Date, week: WorkingWeek): WorkloadGridDto {
  return {
    weeks: weekColumns(now, week),
    rows: [],
    hasOverdue: false,
    hasLater: false,
    hasInferred: false,
    weeklyCapacityMinutes: weeklyCapacityMinutes(week),
  };
}

function cell(minutes: number, inferred: boolean, weeklyCapacity: number): WorkloadGridCellDto {
  return {
    minutes,
    percentOfCapacity: Math.round((minutes / weeklyCapacity) * 100),
    inferred: inferred && minutes > 0,
  };
}

// One person's effort, accumulated per column. `*Inferred` tracks whether any
// of a column's minutes were placed from sprint dates rather than the issue's
// own — a column can mix both, and the marker means "some of this was guessed".
interface Phasing {
  overdue: number;
  overdueInferred: boolean;
  weeks: number[];
  weeksInferred: boolean[];
  later: number;
  laterInferred: boolean;
  unscheduled: number;
}

// The date-bearing shape the repository returns. Not the Prisma type: the
// scheduling module must stay independent of the schema.
interface DatedIssue {
  dueDate: Date | null;
  sprint: { startDate: Date | null; endDate: Date | null } | null;
}

function placeIssue(
  phasing: Phasing,
  issue: DatedIssue,
  remaining: number,
  horizon: Date[],
  now: Date,
  daysPerWeek: number,
): void {
  const window = resolveWindow(
    {
      // Chain rule 1 is dormant: `Issue.startDate` does not exist (WL-4). When
      // it does, this is the only line in the feature that changes.
      startDate: null,
      dueDate: issue.dueDate,
      sprintStartDate: issue.sprint?.startDate ?? null,
      sprintEndDate: issue.sprint?.endDate ?? null,
    },
    now,
  );

  if (window.kind === "UNSCHEDULED") {
    phasing.unscheduled += remaining;
    return;
  }

  const inferred = window.source === "SPRINT_DATES";

  if (window.kind === "OVERDUE") {
    phasing.overdue += remaining;
    phasing.overdueInferred ||= inferred;
    return;
  }

  const spread = distributeAcrossWeeks(window, remaining, horizon, daysPerWeek);
  spread.weeks.forEach((minutes, i) => {
    if (minutes === 0) return;
    phasing.weeks[i]! += minutes;
    if (inferred) phasing.weeksInferred[i] = true;
  });
  if (spread.later > 0) {
    phasing.later += spread.later;
    phasing.laterInferred ||= inferred;
  }
}

export const WorkloadService = {
  // `now` is injectable so the grid's week boundaries are testable; production
  // callers never pass it.
  async getWorkload(actor: Actor, teamId?: string, now: Date = new Date()): Promise<WorkloadDto> {
    const [scope, week] = await Promise.all([
      resolveScope(actor),
      workingWeekFor(actor.organizationId),
    ]);
    const workingWeek = toWorkingWeekDto(week);
    const blank = {
      rows: [],
      grid: emptyGrid(now, week),
      totals: { ...EMPTY_TOTALS },
      workingWeek,
    };
    if (scope !== null && scope.length === 0) {
      return { teams: [], selectedTeamId: null, ...blank };
    }

    const teamRows = await WorkloadRepository.teamsWithCounts(
      actor.organizationId,
      scope ?? undefined,
    );
    const teams = teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      memberCount: t._count.memberships,
    }));
    if (teams.length === 0) {
      return { teams, selectedTeamId: null, ...blank };
    }

    // Default to the biggest team in scope: an org chart has thin parent teams
    // ("Engineering · 1 person") that would otherwise be the landing view purely
    // because they sort first alphabetically (BR-12).
    const largest = teams.reduce((best, t) => (t.memberCount > best.memberCount ? t : best), teams[0]!);
    // A team outside the caller's scope (or org) is indistinguishable from one
    // that doesn't exist (BR-9, F-1).
    const selectedTeamId = teamId ?? largest.id;
    if (!teams.some((t) => t.id === selectedTeamId)) {
      throw new NotFoundError("Team not found.");
    }

    const { rows, grid } = await this.aggregateTeam(actor, selectedTeamId, week, now);
    const totals = rows.reduce<WorkloadTotalsDto>(
      (acc, r) => ({
        people: acc.people + 1,
        openIssues: acc.openIssues + r.openIssues,
        unestimated: acc.unestimated + r.unestimated,
        remainingMinutes: acc.remainingMinutes + r.remainingMinutes,
        overloaded: acc.overloaded + (r.status === "OVERLOADED" ? 1 : 0),
        idle: acc.idle + (r.status === "IDLE" ? 1 : 0),
      }),
      { ...EMPTY_TOTALS },
    );

    return { teams, selectedTeamId, rows, grid, totals, workingWeek };
  },

  // Aggregation for one team's direct members (BR-1..BR-7, BR-13). Two bounded
  // reads: the team's open issues, then their work logs grouped by issue.
  //
  // The list rows and the time-phased grid come out of the SAME pass over the
  // same issues — that is what makes the grid's totals equal the list's numbers
  // by construction rather than by two implementations agreeing (ADR-0035 §3).
  async aggregateTeam(
    actor: Actor,
    teamId: string,
    week: WorkingWeek = DEFAULT_WORKING_WEEK,
    now: Date = new Date(),
  ): Promise<{ rows: WorkloadRowDto[]; grid: WorkloadGridDto }> {
    const weeklyCapacity = weeklyCapacityMinutes(week);
    const members = (await WorkloadRepository.teamMembers(teamId)).map((m) => m.user);
    if (members.length === 0) return { rows: [], grid: emptyGrid(now, week) };

    const issues = await WorkloadRepository.openIssuesForUsers(
      members.map((m) => m.id),
      actor.organizationId,
    );

    const loggedByIssue = new Map<string, number>();
    if (issues.length > 0) {
      const grouped = await WorkloadRepository.loggedByIssue(issues.map((i) => i.id));
      for (const g of grouped) loggedByIssue.set(g.issueId, g._sum.minutes ?? 0);
    }

    const horizon = buildHorizon(now, HORIZON_WEEKS);
    const blankPhasing = (): Phasing => ({
      overdue: 0,
      overdueInferred: false,
      weeks: horizon.map(() => 0),
      weeksInferred: horizon.map(() => false),
      later: 0,
      laterInferred: false,
      unscheduled: 0,
    });

    const byUser = new Map(
      members.map((m) => [
        m.id,
        {
          openIssues: 0,
          unestimated: 0,
          estimated: 0,
          logged: 0,
          remaining: 0,
          phasing: blankPhasing(),
        },
      ]),
    );

    for (const issue of issues) {
      // assigneeId is non-null by the query, but the column is nullable.
      const bucket = issue.assigneeId ? byUser.get(issue.assigneeId) : undefined;
      if (!bucket) continue;
      const logged = loggedByIssue.get(issue.id) ?? 0;
      bucket.openIssues += 1;
      bucket.logged += logged;
      if (issue.estimateMinutes === null) {
        bucket.unestimated += 1;
      } else {
        bucket.estimated += issue.estimateMinutes;
        bucket.remaining += remainingMinutes(issue.estimateMinutes, logged);
      }

      // Unestimated work contributes 0 minutes (BR-4), so it cannot move a cell
      // and there is nothing to place.
      const remaining = remainingMinutes(issue.estimateMinutes, logged);
      if (remaining === 0) continue;
      placeIssue(bucket.phasing, issue, remaining, horizon, now, week.daysPerWeek);
    }

    const rows: WorkloadRowDto[] = members.map((m) => {
      const b = byUser.get(m.id)!;
      const weeks = weeksOfWork(b.remaining, weeklyCapacity);
      return {
        userId: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
        openIssues: b.openIssues,
        unestimated: b.unestimated,
        estimatedMinutes: b.estimated,
        loggedMinutes: b.logged,
        remainingMinutes: b.remaining,
        weeksOfWork: weeks,
        status: workloadStatus(weeks, b.openIssues),
      };
    });

    // Most loaded first; name breaks ties so the order is stable (BR-10).
    rows.sort((a, b) =>
      b.remainingMinutes !== a.remainingMinutes
        ? b.remainingMinutes - a.remainingMinutes
        : a.name.localeCompare(b.name),
    );

    // The grid follows the list's order, so a person occupies the same position
    // in both views and the toggle doesn't shuffle the team.
    const gridRows: WorkloadGridRowDto[] = rows.map((r) => {
      const p = byUser.get(r.userId)!.phasing;
      return {
        userId: r.userId,
        name: r.name,
        avatarUrl: r.avatarUrl,
        overdue: cell(p.overdue, p.overdueInferred, weeklyCapacity),
        weeks: p.weeks.map((m, i) => cell(m, p.weeksInferred[i]!, weeklyCapacity)),
        later: cell(p.later, p.laterInferred, weeklyCapacity),
        unscheduledMinutes: p.unscheduled,
        totalMinutes: r.remainingMinutes,
      };
    });

    return {
      rows,
      grid: {
        weeks: weekColumns(now, week),
        rows: gridRows,
        hasOverdue: gridRows.some((r) => r.overdue.minutes > 0),
        hasLater: gridRows.some((r) => r.later.minutes > 0),
        hasInferred: gridRows.some(
          (r) => r.overdue.inferred || r.later.inferred || r.weeks.some((w) => w.inferred),
        ),
        weeklyCapacityMinutes: weeklyCapacity,
      },
    };
  },

  // Drill-in (BR-11): one person's open issues, scope-checked exactly like the
  // summary — being able to see a number never implies being able to see the
  // work behind it.
  async getUserIssues(actor: Actor, userId: string): Promise<WorkloadIssueDto[]> {
    await this.assertCanSeeUser(actor, userId);

    const issues = await WorkloadRepository.openIssuesForUserDetailed(
      userId,
      actor.organizationId,
      DRILL_IN_LIMIT,
    );
    if (issues.length === 0) return [];

    const grouped = await WorkloadRepository.loggedByIssue(issues.map((i) => i.id));
    const loggedByIssue = new Map(grouped.map((g) => [g.issueId, g._sum.minutes ?? 0]));

    return issues
      .map((i) => {
        const logged = loggedByIssue.get(i.id) ?? 0;
        return {
          id: i.id,
          key: i.key,
          title: i.title,
          type: i.type,
          status: i.status,
          priority: i.priority,
          projectId: i.project.id,
          projectKey: i.project.key,
          projectName: i.project.name,
          estimateMinutes: i.estimateMinutes,
          loggedMinutes: logged,
          remainingMinutes: remainingMinutes(i.estimateMinutes, logged),
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
        };
      })
      .sort((a, b) => b.remainingMinutes - a.remainingMinutes);
  },

  // A caller may see a person only if that person is a direct member of a team
  // in their scope. Admins with MANAGE_TEAMS may see anyone in their own org —
  // still org-checked, so a cross-tenant id 404s rather than returning empty.
  async assertCanSeeUser(actor: Actor, userId: string): Promise<void> {
    if (userId === actor.userId) return;

    const inOrg = await WorkloadRepository.userInOrg(userId, actor.organizationId);
    if (!inOrg) throw new NotFoundError("Person not found.");

    const scope = await resolveScope(actor);
    if (scope === null) return; // org-wide admin scope
    if (scope.length === 0) throw new NotFoundError("Person not found.");

    const members = await WorkloadRepository.memberUserIdsByTeams(scope);
    if (!members.some((m) => m.userId === userId)) {
      throw new NotFoundError("Person not found.");
    }
  },
};
