import { HomeRepository } from "@/features/home/repositories/home.repository";
import { RecentItemRepository } from "@/features/home/repositories/recent-item.repository";
import { FavoriteRepository } from "@/features/home/repositories/favorite.repository";
import { AttentionComposer } from "@/features/home/services/attention";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { plainPreview } from "@/features/comments/lib/mentions";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Actor } from "@/shared/types/actor";
import type {
  ActivityItemDto,
  ActivityPersonDto,
  AttentionItemDto,
  HomeActivityTab,
  HomeDto,
  HomeList,
  HomeProjectDto,
  HomeProjectStatsDto,
  HomeSummaryDto,
  HomeWorkTab,
  InteractionTypeDto,
  UpcomingItemDto,
} from "@/features/home/types/home.types";
import type { PersonalWorkloadDto } from "@/features/workload/types/workload.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// Home orchestration (ADR-0057, 02_home.md). Each section is an independent,
// bounded, org+membership-scoped method (BR-7) so the page can stream them in
// separate <Suspense> boundaries; getHome() composes them for the API/tests.
// Project membership is resolved once per request via React cache().

const MY_WORK_LIMIT = 10;
const FOCUS_LIMIT = 5;
const CONTINUE_LIMIT = 5;
const RECENT_PROJECTS_LIMIT = 6;
const ATTENTION_LIMIT = 10;
const DUE_SOON_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMPLETED_WINDOW_DAYS = 30;
const ACTIVITY_LIMIT = 10;
const ACTIVITY_WINDOW_DAYS = 14;
// BR-14: how many of my issues the event reads look at.
const ACTIVITY_CANDIDATES = 500;
const UPCOMING_LIMIT = 6;
const UPCOMING_WINDOW_DAYS = 14;
const EXCERPT_CHARS = 140;

const WORK_TABS: readonly HomeWorkTab[] = ["assigned", "reported", "mentioned"];
const ACTIVITY_TABS: readonly HomeActivityTab[] = [
  "all",
  "comments",
  "status",
  "assignments",
];

/** A tab from the URL, falling back to the default for anything unrecognised. */
export function parseWorkTab(value: unknown): HomeWorkTab {
  return WORK_TABS.find((t) => t === value) ?? "assigned";
}
export function parseActivityTab(value: unknown): HomeActivityTab {
  return ACTIVITY_TABS.find((t) => t === value) ?? "all";
}

const NO_STATS: HomeProjectStatsDto = {
  issueCount: 0,
  doneCount: 0,
  activeSprints: 0,
  memberCount: 0,
};

const NO_SUMMARY: HomeSummaryDto = {
  open: 0,
  dueThisWeek: 0,
  inProgress: 0,
  inReview: 0,
  blocked: 0,
  completedLast30Days: 0,
};

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

/** Shared empty result, so "no projects" and "no matches" read identically. */
function empty<T>(): HomeList<T> {
  return { items: [], truncated: false };
}

/** Split a `limit + 1` read into the visible page and whether it was cut. */
function capped<T>(rows: T[], limit: number): HomeList<T> {
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

// Audit payloads are JSON written by our own services; read them defensively
// anyway, since a malformed row must drop out of the feed, not crash Home.
function statusOf(data: unknown): string | null {
  const status = (data as { status?: unknown } | null)?.status;
  return typeof status === "string" ? status : null;
}
function assigneeOf(data: unknown): string | null {
  const id = (data as { assigneeId?: unknown } | null)?.assigneeId;
  return typeof id === "string" ? id : null;
}

// BR-15: three grouped reads turned into one stats object per project.
async function projectStatsFor(
  projectIds: string[],
): Promise<Map<string, HomeProjectStatsDto>> {
  const out = new Map<string, HomeProjectStatsDto>();
  if (projectIds.length === 0) return out;
  const { byStatus, activeSprints, members } =
    await HomeRepository.projectStats(projectIds);
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) {
      s = { ...NO_STATS };
      out.set(id, s);
    }
    return s;
  };
  for (const row of byStatus) {
    const s = get(row.projectId);
    s.issueCount += row._count._all;
    if (row.status === "DONE") s.doneCount += row._count._all;
  }
  for (const row of activeSprints) get(row.projectId).activeSprints = row._count._all;
  for (const row of members) get(row.projectId).memberCount = row._count._all;
  return out;
}

export const HomeService = {
  // Active projects the caller belongs to — resolved ONCE per page and passed to
  // each section (BR-7 scope), so there's a single membership query per request.
  async memberProjectIds(actor: Actor): Promise<string[]> {
    const rows = await HomeRepository.memberProjectIds(
      actor.organizationId,
      actor.userId,
    );
    return rows.map((r) => r.projectId);
  },

  async myWork(actor: Actor, projectIds: string[]): Promise<HomeList<IssueListItemDto>> {
    if (projectIds.length === 0) return empty();
    // limit + 1: the extra row never reaches the reader, it only answers "is
    // the number in the header the whole truth". Costs nothing.
    const rows = await HomeRepository.myWork(projectIds, actor.userId, MY_WORK_LIMIT + 1);
    return capped(rows.map(toCard), MY_WORK_LIMIT);
  },

  // BR-13: the My Work panel for one tab.
  async workTab(
    actor: Actor,
    projectIds: string[],
    tab: HomeWorkTab,
  ): Promise<HomeList<IssueListItemDto>> {
    if (projectIds.length === 0) return empty();
    if (tab === "assigned") return this.myWork(actor, projectIds);
    if (tab === "reported") {
      const rows = await HomeRepository.myReported(
        projectIds,
        actor.userId,
        MY_WORK_LIMIT + 1,
      );
      return capped(rows.map(toCard), MY_WORK_LIMIT);
    }
    // Mentioned: dedupe mention order into issue order, then read those issues.
    // Several mentions can share an issue, so read a few mentions per slot.
    const mentioned = await HomeRepository.mentionedIssueIds(
      projectIds,
      actor.userId,
      (MY_WORK_LIMIT + 1) * 4,
    );
    const ordered = [...new Set(mentioned)].slice(0, MY_WORK_LIMIT + 1);
    if (ordered.length === 0) return empty();
    const rows = await HomeRepository.issuesByIds(ordered, projectIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const now = Date.now();
    const cards = ordered
      .map((id) => byId.get(id))
      .filter((r): r is IssueCardRow => r !== undefined)
      .map((r) => toCard(r, now));
    return capped(cards, MY_WORK_LIMIT);
  },

  // BR-14: what other people did to my work. Each source reads at most
  // limit + 1 rows, so the merge can tell whether anything was cut.
  async activity(
    actor: Actor,
    projectIds: string[],
    tab: HomeActivityTab = "all",
  ): Promise<HomeList<ActivityItemDto>> {
    if (projectIds.length === 0) return empty();
    const issues = await HomeRepository.activityCandidates(
      projectIds,
      actor.userId,
      ACTIVITY_CANDIDATES,
    );
    if (issues.length === 0) return empty();
    const issueById = new Map(issues.map((i) => [i.id, i]));
    const ids = issues.map((i) => i.id);
    const now = Date.now();
    const since = new Date(now - ACTIVITY_WINDOW_DAYS * DAY_MS);
    const take = ACTIVITY_LIMIT + 1;

    const actions = [
      ...(tab === "all" || tab === "status" ? (["ISSUE_STATUS_CHANGED"] as const) : []),
      ...(tab === "all" || tab === "assignments"
        ? (["ISSUE_ASSIGNEE_CHANGED"] as const)
        : []),
    ];
    const [comments, events] = await Promise.all([
      tab === "all" || tab === "comments"
        ? HomeRepository.recentComments(ids, actor.userId, since, take)
        : Promise.resolve([]),
      actions.length
        ? HomeRepository.recentIssueEvents(ids, actor.userId, since, [...actions], take)
        : Promise.resolve([]),
    ]);

    // Audit rows carry ids, not names: one lookup for every person mentioned.
    const personIds = new Set<string>();
    for (const e of events) {
      if (e.actorId) personIds.add(e.actorId);
      const to = assigneeOf(e.afterData);
      if (to) personIds.add(to);
    }
    const people = personIds.size
      ? await HomeRepository.usersByIds([...personIds], actor.organizationId)
      : [];
    const personById = new Map<string, ActivityPersonDto>(people.map((u) => [u.id, u]));

    const items: ActivityItemDto[] = [];
    for (const c of comments) {
      const issue = issueById.get(c.issueId);
      if (!issue) continue;
      items.push({
        kind: "COMMENT",
        id: `comment:${c.id}`,
        occurredAt: c.createdAt.toISOString(),
        occurredAgo: relativeTime(c.createdAt.toISOString(), now),
        actor: c.author,
        issue,
        href: `/projects/${issue.projectId}/issues/${issue.id}/comments/${c.id}`,
        excerpt: plainPreview(c.body, EXCERPT_CHARS),
      });
    }
    for (const e of events) {
      const issue = issueById.get(e.entityId);
      if (!issue) continue;
      const base = {
        id: `audit:${e.id}`,
        occurredAt: e.createdAt.toISOString(),
        occurredAgo: relativeTime(e.createdAt.toISOString(), now),
        actor: e.actorId ? (personById.get(e.actorId) ?? null) : null,
        issue,
        href: `/projects/${issue.projectId}/issues/${issue.id}`,
      };
      if (e.action === "ISSUE_STATUS_CHANGED") {
        const status = statusOf(e.afterData);
        if (status) items.push({ ...base, kind: "STATUS", status });
      } else {
        const to = assigneeOf(e.afterData);
        items.push({
          ...base,
          kind: "ASSIGNMENT",
          assignee: to ? (personById.get(to) ?? null) : null,
          toMe: to === actor.userId,
        });
      }
    }
    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return capped(items, ACTIVITY_LIMIT);
  },

  // BR-16: dated things in the next two weeks — my due dates and sprint
  // boundaries in my projects — merged into one calendar order.
  async upcoming(actor: Actor, projectIds: string[]): Promise<UpcomingItemDto[]> {
    if (projectIds.length === 0) return [];
    const from = new Date();
    const to = new Date(from.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS);
    const [due, sprints] = await Promise.all([
      HomeRepository.upcomingDue(projectIds, actor.userId, from, to, UPCOMING_LIMIT),
      HomeRepository.upcomingSprints(projectIds, from, to, UPCOMING_LIMIT),
    ]);
    const items: UpcomingItemDto[] = [
      ...due.flatMap((i) =>
        i.dueDate
          ? [
              {
                id: `due:${i.id}`,
                kind: "DUE" as const,
                date: i.dueDate.toISOString(),
                title: i.title,
                context: i.key,
                href: `/projects/${i.projectId}/issues/${i.id}`,
              },
            ]
          : [],
      ),
      ...sprints.flatMap((sp) => {
        const date = sp.status === "PLANNED" ? sp.startDate : sp.endDate;
        if (!date) return [];
        return [
          {
            id: `sprint:${sp.id}`,
            kind:
              sp.status === "PLANNED"
                ? ("SPRINT_START" as const)
                : ("SPRINT_END" as const),
            date: date.toISOString(),
            title: sp.name,
            context: sp.project.name,
            href: `/projects/${sp.project.id}/backlog`,
          },
        ];
      }),
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, UPCOMING_LIMIT);
  },

  // BR-17: the caller's own queue, from the Workload module's own definitions.
  workload(actor: Actor): Promise<PersonalWorkloadDto> {
    return WorkloadService.getMyQueue(actor);
  },

  // BR-11: what is due (soonest first), then — only if that leaves room — my
  // most urgent open work. The fill read is skipped when due items already fill
  // the panel, so the common busy case is one query.
  async focus(actor: Actor, projectIds: string[]): Promise<HomeList<IssueListItemDto>> {
    if (projectIds.length === 0) return empty();
    const now = Date.now();
    const before = new Date(now + DUE_SOON_WINDOW_DAYS * DAY_MS);
    const due = await HomeRepository.dueSoon(
      projectIds,
      actor.userId,
      before,
      FOCUS_LIMIT + 1,
    );
    if (due.length > FOCUS_LIMIT)
      return capped(
        due.map((r) => toCard(r, now)),
        FOCUS_LIMIT,
      );
    const fill = await HomeRepository.focusFill(
      projectIds,
      actor.userId,
      before,
      FOCUS_LIMIT - due.length + 1,
    );
    return capped(
      [...due, ...fill].map((r) => toCard(r, now)),
      FOCUS_LIMIT,
    );
  },

  // BR-10: the Summary row, one request for all six numbers.
  async summary(actor: Actor, projectIds: string[]): Promise<HomeSummaryDto> {
    if (projectIds.length === 0) return NO_SUMMARY;
    const now = Date.now();
    const [counts, completedLast30Days] = await Promise.all([
      HomeRepository.summaryCounts(
        projectIds,
        actor.userId,
        new Date(now + DUE_SOON_WINDOW_DAYS * DAY_MS),
      ),
      HomeRepository.completedSince(
        projectIds,
        actor.userId,
        new Date(now - COMPLETED_WINDOW_DAYS * DAY_MS),
      ),
    ]);
    return { ...counts, completedLast30Days };
  },

  async attention(
    actor: Actor,
    projectIds: string[],
  ): Promise<HomeList<AttentionItemDto>> {
    if (projectIds.length === 0) return empty();
    const items = await AttentionComposer.compose({
      actor,
      memberProjectIds: projectIds,
      limit: ATTENTION_LIMIT + 1,
    });
    return capped(items, ATTENTION_LIMIT);
  },

  // BR-3: rank recent issues by engagement weight × recency decay; keep only
  // live (non-done, in-scope) issues; cap.
  async continueWorking(actor: Actor, projectIds: string[]): Promise<IssueListItemDto[]> {
    if (projectIds.length === 0) return [];
    const recent = await RecentItemRepository.listByType(
      actor.userId,
      "ISSUE",
      CONTINUE_LIMIT * 3,
    );
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
        const weight =
          INTERACTION_WEIGHT[item.interactionType as InteractionTypeDto] ?? 1;
        const score =
          weight *
          Math.pow(0.5, (now - item.lastInteractedAt.getTime()) / DECAY_HALF_LIFE_MS);
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
    const recentIds = recentItems
      .map((r) => r.entityId)
      .filter((id) => !starredSet.has(id));

    const [starredRows, recentRows] = await Promise.all([
      starredIds.length
        ? HomeRepository.projectsByIds(starredIds, actor.organizationId)
        : Promise.resolve([]),
      recentIds.length
        ? HomeRepository.projectsByIds(recentIds, actor.organizationId)
        : Promise.resolve([]),
    ]);

    const stats = await projectStatsFor([...starredRows, ...recentRows].map((r) => r.id));

    type ProjectRow = {
      id: string;
      key: string;
      name: string;
      description: string | null;
    };
    const toProject = (row: ProjectRow, starred: boolean): HomeProjectDto => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      starred,
      stats: stats.get(row.id) ?? NO_STATS,
    });

    // Preserve recency order (projectsByIds may reorder).
    const recentById = new Map(recentRows.map((r) => [r.id, r]));
    const recentProjects = recentIds
      .map((id) => recentById.get(id))
      .filter((r): r is ProjectRow => r != null)
      .slice(0, RECENT_PROJECTS_LIMIT)
      .map((r) => toProject(r, false));

    return {
      starredProjects: starredRows.map((r) => toProject(r, true)),
      recentProjects,
    };
  },

  // One composed payload (API / tests / non-streaming consumers). Resolves
  // membership once, then runs the sections in parallel.
  async getHome(actor: Actor): Promise<HomeDto> {
    const projectIds = await this.memberProjectIds(actor);
    const [
      summary,
      myWork,
      focus,
      attention,
      continueWorking,
      strip,
      activity,
      upcoming,
      workload,
    ] = await Promise.all([
      this.summary(actor, projectIds),
      this.myWork(actor, projectIds),
      this.focus(actor, projectIds),
      this.attention(actor, projectIds),
      this.continueWorking(actor, projectIds),
      this.projectStrip(actor),
      this.activity(actor, projectIds),
      this.upcoming(actor, projectIds),
      this.workload(actor),
    ]);
    return {
      summary,
      myWork,
      attention,
      continueWorking,
      focus,
      activity,
      upcoming,
      workload,
      starredProjects: strip.starredProjects,
      recentProjects: strip.recentProjects,
    };
  },
};
