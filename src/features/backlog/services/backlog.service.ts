import {
  BacklogRepository,
  DEFAULT_BACKLOG_PAGE_SIZE,
  MAX_BACKLOG_PAGE_SIZE,
} from "@/features/backlog/repositories/backlog.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";
import { elevate, canWriteContent } from "@/features/authorization/permission";

// Business rules from docs/02_Modules/06_backlog.md. RBAC is enforced here,
// server-side. The reorder write lives in IssueService.reorder (scope=backlog,
// ADR-0013); this service owns the read-only backlog view.

type CardRow = Awaited<
  ReturnType<typeof BacklogRepository.listUnscheduled>
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

const canWrite = canWriteContent;

export const BacklogService = {
  // BR-1/BR-5: any authenticated org member may VIEW a project's backlog
  // (projects are org-visible, 03_projects.md BR-7); drag rights are role-gated.
  // VIEWER (or a non-member) gets a read-only backlog.
  async getBacklog(
    actor: Actor,
    projectId: string,
    page: { cursor?: string; take?: number } = {},
  ): Promise<BacklogDto> {
    // Existence + tenant scope (F-1): a project outside the caller's org is
    // treated as absent — never reveal existence across organizations.
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));

    const pageSize = Math.min(
      page.take ?? DEFAULT_BACKLOG_PAGE_SIZE,
      MAX_BACKLOG_PAGE_SIZE,
    );
    const rows = await BacklogRepository.listUnscheduled(projectId, {
      cursor: page.cursor,
      take: pageSize,
    });

    // listUnscheduled fetches pageSize + 1 to detect a further page.
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return { items: items.map(toCardDto), nextCursor, canWrite: canWrite(role) };
  },
};
