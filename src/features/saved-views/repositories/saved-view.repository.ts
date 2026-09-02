import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type SavedViewSortDto,
} from "@/features/saved-views/types/saved-view.types";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";

// Saved views + the cross-project issue query (ADR-0040). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

// Re-exported so existing importers keep working; defined in the types
// module (client components need them too).
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

const ownerSelect = { select: { id: true, name: true } } as const;

const viewSelect = {
  id: true,
  name: true,
  filter: true,
  sort: true,
  visibility: true,
  ownerId: true,
  owner: ownerSelect,
} as const;

// The row shape the cross-project list returns. `project` is the addition over
// a scoped list — without it a reader cannot tell which VWP-12 they are seeing.
const crossProjectSelect = {
  id: true,
  key: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  storyPoints: true,
  dueDate: true,
  updatedAt: true,
  version: true,
  projectId: true,
  project: { select: { key: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  // A subtask's parent key (ADR-0045 §6). This list mixes subtasks with
  // standalone issues, and without it a subtask row reads as an orphan
  // sentence — the same reason the board card carries it.
  parentId: true,
  parent: { select: { key: true } },
  // Open blockers, for the Blocked badge (ADR-0046 §7).
  _count: {
    select: {
      linksIn: {
        where: { type: "BLOCKS", source: { deletedAt: null, status: { not: "DONE" } } },
      },
    },
  },
} as const;

/**
 * Sort, as an `orderBy` with a total tiebreaker.
 *
 * Every option ends with `id` so the ordering is total and the keyset cursor is
 * deterministic. Without it, two issues sharing an `updatedAt` can swap places
 * between pages and the reader sees one twice while another never appears.
 *
 * Nulls are placed last on the date sorts: an issue with no due date is not
 * "due first", which is what ascending nulls would imply.
 */
function orderFor(sort: SavedViewSortDto): Prisma.IssueOrderByWithRelationInput[] {
  switch (sort) {
    case "UPDATED_ASC":
      return [{ updatedAt: "asc" }, { id: "asc" }];
    case "CREATED_DESC":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "CREATED_ASC":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "DUE_DATE_ASC":
      return [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "DUE_DATE_DESC":
      return [{ dueDate: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    // `priority` is a Postgres enum declared LOWEST→HIGHEST, so "desc" is
    // most-urgent-first. Named by what the reader wants, not by the sort word.
    case "PRIORITY_DESC":
      return [{ priority: "desc" }, { id: "asc" }];
    case "PRIORITY_ASC":
      return [{ priority: "asc" }, { id: "asc" }];
    case "KEY_ASC":
      return [{ key: "asc" }, { id: "asc" }];
    case "UPDATED_DESC":
    default:
      return [{ updatedAt: "desc" }, { id: "asc" }];
  }
}

export const SavedViewRepository = {
  /** Active projects the caller belongs to, in their org (BR-2). */
  memberProjectIds(organizationId: string, userId: string) {
    return prisma.projectMember.findMany({
      where: {
        userId,
        deletedAt: null,
        project: { organizationId, status: "ACTIVE", deletedAt: null },
      },
      select: { projectId: true },
    });
  },

  /** Every active project in the org — the org-admin path (BR-2). */
  allProjectIds(organizationId: string) {
    return prisma.project.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
  },

  /**
   * One page of issues across the given projects.
   *
   * Takes `take + 1` and lets the service decide whether there is a next page,
   * so "is there more" costs no extra query.
   */
  listIssues(
    projectIds: string[],
    filter: IssueFilter,
    sort: SavedViewSortDto,
    page: { cursor?: string; take: number },
    customFields: ResolvedPredicate[] = [],
  ) {
    return prisma.issue.findMany({
      where: issueFilterWhere({ projectIds }, filter, customFields),
      select: crossProjectSelect,
      orderBy: orderFor(sort),
      take: page.take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  // ── Views ────────────────────────────────────────────────────────────────

  /** The caller's own views plus everything shared in their org (BR-4). */
  listViews(organizationId: string, userId: string) {
    return prisma.savedView.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ ownerId: userId }, { visibility: "SHARED" }],
      },
      select: viewSelect,
      orderBy: [{ name: "asc" }],
    });
  },

  findById(id: string, organizationId: string) {
    return prisma.savedView.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: viewSelect,
    });
  },

  create(data: {
    organizationId: string;
    ownerId: string;
    name: string;
    filter: IssueFilter;
    sort: SavedViewSortDto;
    visibility: "PRIVATE" | "SHARED";
    actorId: string;
  }) {
    return prisma.savedView.create({
      data: {
        organizationId: data.organizationId,
        ownerId: data.ownerId,
        name: data.name,
        filter: data.filter as Prisma.InputJsonValue,
        sort: data.sort,
        visibility: data.visibility,
        createdBy: data.actorId,
        updatedBy: data.actorId,
      },
      select: viewSelect,
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      filter?: IssueFilter;
      sort?: SavedViewSortDto;
      visibility?: "PRIVATE" | "SHARED";
      actorId: string;
    },
  ) {
    return prisma.savedView.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.filter !== undefined
          ? { filter: data.filter as Prisma.InputJsonValue }
          : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        updatedBy: data.actorId,
      },
      select: viewSelect,
    });
  },

  /** Soft delete, like everything else (BR-11) — no hard deletes from app code. */
  softDelete(id: string, actorId: string) {
    return prisma.savedView.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
      select: { id: true },
    });
  },
};
