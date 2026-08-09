import { HomeRepository } from "@/features/home/repositories/home.repository";
import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import { FavoriteRepository } from "@/features/home/repositories/favorite.repository";
import { AttentionComposer } from "@/features/home/services/attention";
import type { Actor } from "@/shared/types/actor";
import type {
  AttentionItemDto,
  HomeDto,
  HomeProjectDto,
  InteractionTypeDto,
} from "@/features/home/types/home.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// Home orchestration (ADR-0012, 02_home.md). Each section is an independent,
// bounded, org+membership-scoped method (BR-7) so the page can stream them in
// separate <Suspense> boundaries; getHome() composes them for the API/tests.
// Project membership is resolved once per request via React cache().

const MY_WORK_LIMIT = 10;
const DUE_SOON_LIMIT = 8;
const CONTINUE_LIMIT = 5;
const RECENT_PROJECTS_LIMIT = 6;
const ATTENTION_LIMIT = 10;
const DUE_SOON_WINDOW_DAYS = 7;

// Engagement weights for "Continue working" (BR-3): active work outranks a
// passive view; recency decays with a 24h half-life.
const INTERACTION_WEIGHT: Record<InteractionTypeDto, number> = {
  VIEWED: 1,
  ASSIGNED: 2,
  MENTIONED: 2,
  COMMENTED: 3,
  TRANSITIONED: 3,
  EDITED: 3,
};
const DECAY_HALF_LIFE_MS = 24 * 60 * 60 * 1000;

type IssueCardRow = Awaited<ReturnType<typeof HomeRepository.myWork>>[number];

function toCard(row: IssueCardRow, now = Date.now()): IssueListItemDto {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    storyPoints: row.storyPoints,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    dueOverdue: row.dueDate ? row.dueDate.getTime() < now : false,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    assignee: row.assignee,
  };
}

export const HomeService = {
  // Active projects the caller belongs to — resolved ONCE per page and passed to
  // each section (BR-7 scope), so there's a single membership query per request.
  async memberProjectIds(actor: Actor): Promise<string[]> {
    const rows = await HomeRepository.memberProjectIds(actor.organizationId, actor.userId);
    return rows.map((r) => r.projectId);
  },

  async myWork(actor: Actor, projectIds: string[]): Promise<IssueListItemDto[]> {
    if (projectIds.length === 0) return [];
    const rows = await HomeRepository.myWork(projectIds, actor.userId, MY_WORK_LIMIT);
    return rows.map(toCard);
  },

  async dueSoon(actor: Actor, projectIds: string[]): Promise<IssueListItemDto[]> {
    if (projectIds.length === 0) return [];
    const before = new Date(Date.now() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await HomeRepository.dueSoon(projectIds, actor.userId, before, DUE_SOON_LIMIT);
    return rows.map(toCard);
  },

  async attention(actor: Actor, projectIds: string[]): Promise<AttentionItemDto[]> {
    if (projectIds.length === 0) return [];
    return AttentionComposer.compose({ actor, memberProjectIds: projectIds, limit: ATTENTION_LIMIT });
  },

  // BR-3: rank recent issues by engagement weight × recency decay; keep only
  // live (non-done, in-scope) issues; cap.
  async continueWorking(actor: Actor, projectIds: string[]): Promise<IssueListItemDto[]> {
    if (projectIds.length === 0) return [];
    const recent = await RecentItemRepository.listByType(actor.userId, "ISSUE", CONTINUE_LIMIT * 3);
    if (recent.length === 0) return [];
    const rows = await HomeRepository.issuesByIds(
      recent.map((r) => r.entityId),
      projectIds,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const now = Date.now();
    return recent
      .map((item) => {
        const row = byId.get(item.entityId);
        if (!row) return null;
        const weight = INTERACTION_WEIGHT[item.interactionType as InteractionTypeDto] ?? 1;
        const score = weight * Math.pow(0.5, (now - item.lastInteractedAt.getTime()) / DECAY_HALF_LIFE_MS);
        return { row, score };
      })
      .filter((x): x is { row: IssueCardRow; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTINUE_LIMIT)
      .map((x) => toCard(x.row));
  },

  // BR-5: starred (explicit) + recent (implicit) projects, deduped, scoped.
  async projectStrip(
    actor: Actor,
  ): Promise<{ starredProjects: HomeProjectDto[]; recentProjects: HomeProjectDto[] }> {
    const [starredIdRows, recentItems] = await Promise.all([
      FavoriteRepository.listEntityIds(actor.userId, "PROJECT"),
      RecentItemRepository.listByType(actor.userId, "PROJECT", RECENT_PROJECTS_LIMIT * 2),
    ]);
    const starredIds = starredIdRows.map((r) => r.entityId);
    const starredSet = new Set(starredIds);
    const recentIds = recentItems.map((r) => r.entityId).filter((id) => !starredSet.has(id));

    const [starredRows, recentRows] = await Promise.all([
      starredIds.length
        ? HomeRepository.projectsByIds(starredIds, actor.organizationId)
        : Promise.resolve([]),
      recentIds.length
        ? HomeRepository.projectsByIds(recentIds, actor.organizationId)
        : Promise.resolve([]),
    ]);

    type ProjectRow = { id: string; key: string; name: string; description: string | null };
    const toProject = (row: ProjectRow, starred: boolean): HomeProjectDto => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      starred,
    });

    // Preserve recency order (projectsByIds may reorder).
    const recentById = new Map(recentRows.map((r) => [r.id, r]));
    const recentProjects = recentIds
      .map((id) => recentById.get(id))
      .filter((r): r is ProjectRow => r != null)
      .slice(0, RECENT_PROJECTS_LIMIT)
      .map((r) => toProject(r, false));

    return { starredProjects: starredRows.map((r) => toProject(r, true)), recentProjects };
  },

  // One composed payload (API / tests / non-streaming consumers). Resolves
  // membership once, then runs the sections in parallel.
  async getHome(actor: Actor): Promise<HomeDto> {
    const projectIds = await this.memberProjectIds(actor);
    const [myWork, dueSoon, attention, continueWorking, strip] = await Promise.all([
      this.myWork(actor, projectIds),
      this.dueSoon(actor, projectIds),
      this.attention(actor, projectIds),
      this.continueWorking(actor, projectIds),
      this.projectStrip(actor),
    ]);
    return {
      myWork,
      attention,
      continueWorking,
      dueSoon,
      starredProjects: strip.starredProjects,
      recentProjects: strip.recentProjects,
    };
  },
};
