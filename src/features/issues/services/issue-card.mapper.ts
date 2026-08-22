import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import type {
  IssueListItemDto,
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// The one row → `IssueListItemDto` mapping, paired with `issueCardSelect`.
//
// The select stopped the surfaces asking for different columns; this stops them
// mapping the same columns differently. Board, Backlog and the Issues list each
// had their own copy, and two of the three forgot the chips — a field added to
// the query is worthless if the mapper drops it.
//
// Structural, not stylistic: adding a card field is now exactly two edits
// (`issueCardSelect` + here) and every list surface picks it up.

/** Exactly what `issueCardSelect` returns. Kept structural so it stays free of Prisma. */
export interface IssueCardRow {
  id: string;
  projectId: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  workflowStatus?: WorkflowStatusDto;
  priority: IssuePriorityDto;
  storyPoints: number | null;
  updatedAt: Date;
  version: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  epicId?: string | null;
  epic?: { id?: string; key: string } | null;
  parentId?: string | null;
  parent?: { id?: string; key: string } | null;
  _count?: { linksIn: number };
  labels?: { label: { id: string; name: string; color: string } }[];
  components?: { component: { id: string; name: string } }[];
}

export function toIssueCardDto(row: IssueCardRow): IssueListItemDto {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    workflowStatus: row.workflowStatus,
    priority: row.priority,
    storyPoints: row.storyPoints,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    assignee: row.assignee,
    epicId: row.epicId ?? null,
    epicKey: row.epic?.key,
    parentId: row.parentId ?? null,
    parentKey: row.parent?.key,
    blockedBy: row._count?.linksIn ?? 0,
    // Flattened out of their join rows so the DTO carries the entity, not the
    // relation — the client should never see `{ label: { … } }`.
    labels: row.labels?.map((l) => l.label) ?? [],
    components: row.components?.map((c) => c.component) ?? [],
  };
}
