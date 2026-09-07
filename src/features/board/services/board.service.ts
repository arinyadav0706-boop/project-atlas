import {
  BOARD_COLUMN_LIMIT,
  BOARD_COLUMN_PAGE,
  BoardRepository,
} from "@/features/board/repositories/board.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowRepository } from "@/features/workflow/repositories/workflow.repository";
// One card shape + mapper for every list surface (ADR-0018/0026).
import { toIssueCardDto } from "@/features/issues/services/issue-card.mapper";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { BoardDto, BoardFilter } from "@/features/board/types/board.types";
import type {
  IssueListItemDto,
  IssueStatusCounts,
} from "@/features/issues/types/issue.types";
import { elevate, canWriteContent } from "@/features/authorization/permission";

// Business rules from docs/02_Modules/05_board.md. RBAC is enforced here,
// server-side. The reorder write lives in IssueService.reorder (shared with
// the Backlog); this service owns the read-only board view.



const canWrite = canWriteContent;

export const BoardService = {
  // BR-1/BR-2/BR-5: any authenticated org member may VIEW a project's board
  // (projects are org-visible, 03_projects.md BR-7); drag rights are role-gated
  // via `canWrite`. VIEWER (or a non-member) gets a read-only board.
  async getBoard(
    actor: Actor,
    projectId: string,
    filter: BoardFilter,
  ): Promise<BoardDto> {
    // Existence + tenant scope (F-1): a project outside the caller's org is
    // treated as absent.
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));

    // The project's own statuses decide the columns (30_workflow BR-5), so the
    // board is data-driven: two columns for a team that wants two, twelve for a
    // team that wants twelve.
    const statuses = await WorkflowRepository.list(projectId);

    const [columns, byCategory, byStatusId] = await Promise.all([
      // One bounded, index-covered read per column, in parallel.
      Promise.all(
        statuses.map(async (status) => ({
          status,
          ...page(
            await BoardRepository.columnItems(projectId, status.id, filter, {
              take: BOARD_COLUMN_PAGE,
            }),
            BOARD_COLUMN_PAGE,
          ),
        })),
      ),
      BoardRepository.countByCategory(projectId, filter),
      BoardRepository.countByStatusId(projectId, filter),
    ]);

    // The chips still speak in categories — "3 in progress" means the same
    // thing whether a team has one in-progress column or four.
    const counts: IssueStatusCounts = {
      ALL: 0,
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
    };
    for (const row of byCategory) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }

    const totals = new Map(byStatusId.map((r) => [r.statusId, r._count._all]));

    return {
      columns: columns.map((c) => ({ ...c, count: totals.get(c.status.id) ?? 0 })),
      counts,
      appliedFilter: filter,
      canWrite: canWrite(role),
    };
  },

  /**
   * The next page of ONE column (UX-5).
   *
   * Deliberately not "reload the whole board with a bigger page": the other
   * columns have not changed, refetching them would discard their own paging,
   * and a board with twelve statuses would re-read eleven of them to grow one.
   *
   * Same permission path as `getBoard` — the read is re-authorised here rather
   * than trusting that the caller already loaded the board, because a route is
   * reachable directly.
   */
  async getColumnPage(
    actor: Actor,
    projectId: string,
    statusId: string,
    filter: BoardFilter,
    cursor: string | undefined,
    take = BOARD_COLUMN_PAGE,
  ): Promise<{ items: IssueListItemDto[]; nextCursor: string | null }> {
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    // The status must belong to THIS project, or a status id from another
    // project would read that project's cards through this one's permission
    // check.
    const statuses = await WorkflowRepository.list(projectId);
    if (!statuses.some((s) => s.id === statusId)) {
      throw new NotFoundError("Status not found.");
    }

    const size = Math.min(Math.max(take, 1), BOARD_COLUMN_LIMIT);
    const rows = await BoardRepository.columnItems(projectId, statusId, filter, {
      cursor,
      take: size,
    });
    return page(rows, size);
  },
};

/**
 * Split a `take + 1` read into the page and its next cursor.
 *
 * One helper rather than the same three lines in both callers — the bug it
 * prevents is the classic one where the extra row is returned to the client on
 * one path and trimmed on the other, so the last page shows 51 cards.
 */
function page(
  rows: Parameters<typeof toIssueCardDto>[0][],
  take: number,
): { items: IssueListItemDto[]; nextCursor: string | null } {
  const hasMore = rows.length > take;
  const items = (hasMore ? rows.slice(0, take) : rows).map(toIssueCardDto);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
