import { BoardRepository } from "@/features/board/repositories/board.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowRepository } from "@/features/workflow/repositories/workflow.repository";
// One card shape + mapper for every list surface (ADR-0018/0026).
import { toIssueCardDto } from "@/features/issues/services/issue-card.mapper";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { BoardDto, BoardFilter } from "@/features/board/types/board.types";
import type {
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
          items: (
            await BoardRepository.columnItems(projectId, status.id, filter)
          ).map(toIssueCardDto),
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
};
