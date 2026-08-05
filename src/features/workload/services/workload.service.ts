import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { AdminCapability, hasCapability } from "@/features/admin/authz/capabilities";
import { TeamService } from "@/features/teams/services/team.service";
import { WorkloadRepository } from "@/features/workload/repositories/workload.repository";
import {
  remainingMinutes,
  weeksOfWork,
  workloadStatus,
} from "@/features/workload/lib/capacity";
import type {
  WorkloadDto,
  WorkloadIssueDto,
  WorkloadRowDto,
  WorkloadTotalsDto,
} from "@/features/workload/types/workload.types";

// Business rules: docs/02_Modules/21_workload.md (ADR-0034). RBAC is enforced
// here, server-side, on every call — the client never decides scope (BR-8).

const DRILL_IN_LIMIT = 50;

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

export const WorkloadService = {
  async getWorkload(actor: Actor, teamId?: string): Promise<WorkloadDto> {
    const scope = await resolveScope(actor);
    if (scope !== null && scope.length === 0) {
      return { teams: [], selectedTeamId: null, rows: [], totals: { ...EMPTY_TOTALS } };
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
      return { teams, selectedTeamId: null, rows: [], totals: { ...EMPTY_TOTALS } };
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

    const rows = await this.rowsForTeam(actor, selectedTeamId);
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

    return { teams, selectedTeamId, rows, totals };
  },

  // Aggregation for one team's direct members (BR-1..BR-7). Two bounded reads:
  // the team's open issues, then their work logs grouped by issue.
  async rowsForTeam(actor: Actor, teamId: string): Promise<WorkloadRowDto[]> {
    const members = (await WorkloadRepository.teamMembers(teamId)).map((m) => m.user);
    if (members.length === 0) return [];

    const issues = await WorkloadRepository.openIssuesForUsers(
      members.map((m) => m.id),
      actor.organizationId,
    );

    const loggedByIssue = new Map<string, number>();
    if (issues.length > 0) {
      const grouped = await WorkloadRepository.loggedByIssue(issues.map((i) => i.id));
      for (const g of grouped) loggedByIssue.set(g.issueId, g._sum.minutes ?? 0);
    }

    const byUser = new Map<
      string,
      { openIssues: number; unestimated: number; estimated: number; logged: number; remaining: number }
    >(members.map((m) => [m.id, { openIssues: 0, unestimated: 0, estimated: 0, logged: 0, remaining: 0 }]));

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
    }

    const rows: WorkloadRowDto[] = members.map((m) => {
      const b = byUser.get(m.id)!;
      const weeks = weeksOfWork(b.remaining);
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
    return rows;
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
