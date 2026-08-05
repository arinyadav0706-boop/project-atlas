import type { Actor } from "@/shared/types/actor";
import { NotFoundError, ValidationError } from "@/shared/lib/errors";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditAction } from "@/features/admin/audit/audit-actions";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { TeamRepository } from "@/features/teams/repositories/team.repository";
import type {
  MyTeamDto,
  TeamDetailDto,
  TeamListItemDto,
} from "@/features/teams/types/team.types";
import type {
  CreateTeamInput,
  UpdateTeamInput,
} from "@/features/teams/validation/team.schemas";

// Business rules from docs/02_Modules/20_teams.md (ADR-0031/0032). Admin RBAC via
// the MANAGE_TEAMS capability; hierarchy integrity + tenant scope enforced here.

type HierRow = { id: string; parentTeamId: string | null; managerId: string | null };

// Team ids reachable downward from `roots` following parentTeamId (inclusive).
function descendants(roots: string[], rows: HierRow[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentTeamId) {
      const arr = childrenOf.get(r.parentTeamId) ?? [];
      arr.push(r.id);
      childrenOf.set(r.parentTeamId, arr);
    }
  }
  const out = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return out;
}

// Would setting team `teamId`'s parent to `parentId` create a cycle? True if
// teamId is an ancestor-or-self of parentId (walking parentId upward).
function wouldCycle(teamId: string, parentId: string, rows: HierRow[]): boolean {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentTeamId]));
  let cur: string | null = parentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === teamId) return true;
    if (seen.has(cur)) break; // pre-existing cycle guard (shouldn't happen)
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

async function assertInOrg(id: string, organizationId: string, label: string): Promise<void> {
  const found = await TeamRepository.userInOrg(id, organizationId);
  if (!found) throw new ValidationError(`That ${label} isn't in this organization.`);
}

async function requireTeam(id: string, actor: Actor) {
  const team = await TeamRepository.findById(id);
  if (!team || team.organizationId !== actor.organizationId) {
    throw new NotFoundError("Team not found.");
  }
  return team;
}

export const TeamService = {
  async list(actor: Actor): Promise<TeamListItemDto[]> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    const rows = await TeamRepository.listByOrg(actor.organizationId);
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      manager: t.manager ? { id: t.manager.id, name: t.manager.name } : null,
      parentTeamId: t.parentTeamId,
      parentTeamName: t.parentTeam?.name ?? null,
      memberCount: t._count.memberships,
    }));
  },

  // Nav gate — no capability needed; anyone can manage a team via managerId.
  managesAnyTeam(actor: Actor): Promise<boolean> {
    return TeamRepository.managesAnyTeam(actor.userId, actor.organizationId);
  },

  async listAssignableUsers(
    actor: Actor,
  ): Promise<{ id: string; name: string; email: string }[]> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    return TeamRepository.orgUsers(actor.organizationId);
  },

  async getDetail(actor: Actor, teamId: string): Promise<TeamDetailDto> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    await requireTeam(teamId, actor);
    const detail = await TeamRepository.findDetail(teamId);
    if (!detail) throw new NotFoundError("Team not found.");
    return {
      id: detail.id,
      name: detail.name,
      managerId: detail.managerId,
      parentTeamId: detail.parentTeamId,
      members: detail.memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      })),
    };
  },

  async create(actor: Actor, input: CreateTeamInput): Promise<{ id: string }> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    if (input.managerId) await assertInOrg(input.managerId, actor.organizationId, "manager");
    if (input.parentTeamId) await requireTeam(input.parentTeamId, actor);

    const team = await TeamRepository.create({
      organizationId: actor.organizationId,
      name: input.name,
      managerId: input.managerId ?? null,
      parentTeamId: input.parentTeamId ?? null,
      actorId: actor.userId,
    });
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.TEAM_CREATED,
      entityType: "Team",
      entityId: team.id,
      afterData: { name: input.name },
    });
    return team;
  },

  async update(actor: Actor, teamId: string, input: UpdateTeamInput): Promise<{ id: string }> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    await requireTeam(teamId, actor);

    if (input.managerId) await assertInOrg(input.managerId, actor.organizationId, "manager");
    if (input.parentTeamId) {
      if (input.parentTeamId === teamId) {
        throw new ValidationError("A team can't be its own parent.");
      }
      await requireTeam(input.parentTeamId, actor);
      const rows = await TeamRepository.hierarchyRows(actor.organizationId);
      if (wouldCycle(teamId, input.parentTeamId, rows)) {
        throw new ValidationError("That parent would create a cycle in the team hierarchy.");
      }
    }

    await TeamRepository.update(
      teamId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
        ...(input.parentTeamId !== undefined ? { parentTeamId: input.parentTeamId } : {}),
      },
      actor.userId,
    );
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.TEAM_UPDATED,
      entityType: "Team",
      entityId: teamId,
      afterData: { ...input },
    });
    return { id: teamId };
  },

  async remove(actor: Actor, teamId: string): Promise<void> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    const team = await requireTeam(teamId, actor);
    await TeamRepository.deleteWithReparent(teamId, team.parentTeamId, actor.userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.TEAM_DELETED,
      entityType: "Team",
      entityId: teamId,
    });
  },

  async addMember(actor: Actor, teamId: string, userId: string): Promise<void> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    await requireTeam(teamId, actor);
    await assertInOrg(userId, actor.organizationId, "user");
    await TeamRepository.addMember(teamId, userId, actor.userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.TEAM_MEMBER_ADDED,
      entityType: "Team",
      entityId: teamId,
      afterData: { userId },
    });
  },

  async removeMember(actor: Actor, teamId: string, userId: string): Promise<void> {
    requireCapability(actor, AdminCapability.MANAGE_TEAMS);
    await requireTeam(teamId, actor);
    await TeamRepository.removeMember(teamId, userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.TEAM_MEMBER_REMOVED,
      entityType: "Team",
      entityId: teamId,
      afterData: { userId },
    });
  },

  // Manager visibility (ADR-0032): the set of user ids the actor manages —
  // members of every team they manage plus all descendant teams, plus the actor.
  // Org-scoped (F-1); no new infra; O(teams). Consumed by Workload (Epic 3).
  async getManagedUserIds(actor: Actor): Promise<Set<string>> {
    const rows = await TeamRepository.hierarchyRows(actor.organizationId);
    const roots = rows.filter((r) => r.managerId === actor.userId).map((r) => r.id);
    const result = new Set<string>([actor.userId]);
    if (roots.length === 0) return result;
    const managedTeamIds = [...descendants(roots, rows)];
    const memberships = await TeamRepository.membershipsByTeamIds(managedTeamIds);
    for (const m of memberships) result.add(m.userId);
    return result;
  },

  // The "My Team" view: the actor's reports (managed users excluding themselves)
  // with their team name. `manages` gates the sidebar entry.
  async getMyTeam(actor: Actor): Promise<MyTeamDto> {
    const managed = await this.getManagedUserIds(actor);
    managed.delete(actor.userId);
    if (managed.size === 0) return { manages: false, reports: [] };
    const rows = await TeamRepository.reportsByUserIds([...managed]);
    return {
      manages: true,
      reports: rows.map((r) => ({
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        avatarUrl: r.user.avatarUrl,
        teamName: r.team.name,
      })),
    };
  },
};
