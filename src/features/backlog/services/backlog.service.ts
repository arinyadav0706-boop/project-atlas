import {
  BacklogRepository,
  DEFAULT_BACKLOG_PAGE_SIZE,
  MAX_BACKLOG_PAGE_SIZE,
} from "@/features/backlog/repositories/backlog.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
// One card mapper for every list surface — see issue-card.mapper.ts.
import { toIssueCardDto } from "@/features/issues/services/issue-card.mapper";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { elevate, canWriteContent } from "@/features/authorization/permission";

// Business rules from docs/02_Modules/06_backlog.md. RBAC is enforced here,
// server-side. The reorder write lives in IssueService.reorder (scope=backlog,
// ADR-0013); this service owns the read-only backlog view.


const canWrite = canWriteContent;

export const BacklogService = {
  // BR-1/BR-5: any authenticated org member may VIEW a project's backlog
  // (projects are org-visible, 03_projects.md BR-7); drag rights are role-gated.
  // VIEWER (or a non-member) gets a read-only backlog.
  async getBacklog(
    actor: Actor,
    projectId: string,
    filter: IssueFilter = {},
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
    // The count runs alongside the page: a filtered backlog must be able to say
    // how much it matched, not just how much fits on one page.
    const [rows, total] = await Promise.all([
      BacklogRepository.listUnscheduled(projectId, filter, {
        cursor: page.cursor,
        take: pageSize,
      }),
      BacklogRepository.countUnscheduled(projectId, filter),
    ]);

    // listUnscheduled fetches pageSize + 1 to detect a further page.
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return {
      items: items.map(toIssueCardDto),
      nextCursor,
      canWrite: canWrite(role),
      total,
      // Echoed so the client renders exactly what the server applied — never
      // its own optimistic idea of the filter.
      appliedFilter: filter,
    };
  },
};
