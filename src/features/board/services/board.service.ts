import { BoardRepository } from "@/features/board/repositories/board.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { ISSUE_STATUSES } from "@/features/issues/services/issue-workflow";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { BoardDto, BoardFilter } from "@/features/board/types/board.types";
import type {
  IssueListItemDto,
  IssueStatusCounts,
} from "@/features/issues/types/issue.types";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";

// Business rules from docs/02_Modules/05_board.md. RBAC is enforced here,
// server-side. The reorder write lives in IssueService.reorder (shared with
// the Backlog); this service owns the read-only board view.

type CardRow = Awaited<
  ReturnType<typeof BoardRepository.columnItems>
>[number];

function toCardDto(row: CardRow): IssueListItemDto {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    storyPoints: row.storyPoints,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    assignee: row.assignee,
  };
}

function canWrite(role: ProjectRoleDto | null): boolean {
  return role === "MEMBER" || role === "LEAD";
}

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
    const role = await ProjectService.getMemberRole(projectId, actor.userId);

    const [columns, grouped] = await Promise.all([
      // Four bounded, index-covered column reads in parallel.
      Promise.all(
        ISSUE_STATUSES.map(async (status) => ({
          status,
          items: (
            await BoardRepository.columnItems(projectId, status, filter)
          ).map(toCardDto),
        })),
      ),
      BoardRepository.countByStatus(projectId, filter),
    ]);

    const counts: IssueStatusCounts = {
      ALL: 0,
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
    };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }

    return { columns, counts, appliedFilter: filter, canWrite: canWrite(role) };
  },
};
