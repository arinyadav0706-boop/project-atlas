import type { IssueDetailDto, IssueListItemDto } from "@/features/issues/types/issue.types";
import type { ProjectDto } from "@/features/projects/types/project.types";
import type { CommentDto } from "@/features/comments/types/comment.types";

// Internal DTO → public resource (ADR-0052 §1).
//
// The whole point of this file is that it is a TRANSLATION and not a
// re-export. Handing an integrator `IssueListItemDto` directly would make
// `version`, `blockedBy`, `epicKey` and every future field the UI needs into a
// public promise, and the next time a component wanted a different shape we
// would either break somebody's script or stop changing the component. One
// boring mapper is the price of being able to refactor at all.
//
// It is also where fields the outside world has no business seeing are
// dropped: `canEdit`/`canDelete` are answers to "what should this button do",
// not facts about the issue, and `myRole` is about the caller rather than the
// project.

export interface PublicUser {
  id: string;
  name: string;
  email?: string;
}

export interface PublicProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export interface PublicIssue {
  id: string;
  key: string;
  projectId: string;
  type: string;
  title: string;
  description?: string | null;
  /** The project's own status — what a board column is called (30_workflow). */
  status: { id: string; name: string; category: string };
  priority: string;
  assignee: PublicUser | null;
  reporter?: PublicUser | null;
  storyPoints: number | null;
  parentId: string | null;
  epicId: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt: string;
  /**
   * The optimistic-concurrency token (ADR-0011).
   *
   * Exposed deliberately, unlike the rest of the UI's bookkeeping: a client
   * that reads an issue, decides something, and writes it back needs a way to
   * find out the issue moved underneath it. Without this the API is a
   * last-write-wins race by construction.
   */
  version: number;
}

export interface PublicComment {
  id: string;
  issueId: string;
  body: string;
  author: PublicUser | null;
  /** True when an automation rule posted it, not a person (ADR-0050 §4). */
  automated: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export function toPublicProject(project: ProjectDto): PublicProject {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
  };
}

export function toPublicIssue(issue: IssueListItemDto | IssueDetailDto): PublicIssue {
  const detail = issue as Partial<IssueDetailDto>;
  return {
    id: issue.id,
    key: issue.key,
    projectId: issue.projectId,
    type: issue.type,
    title: issue.title,
    // `workflowStatus` is optional on the internal list DTO (some surfaces
    // omit it), but a public issue without a status is not a shape any client
    // should have to defend against — so it falls back to the category, which
    // is always present.
    status: issue.workflowStatus
      ? {
          id: issue.workflowStatus.id,
          name: issue.workflowStatus.name,
          category: issue.workflowStatus.category,
        }
      : { id: "", name: issue.status, category: issue.status },
    priority: issue.priority,
    assignee: issue.assignee ? { id: issue.assignee.id, name: issue.assignee.name } : null,
    storyPoints: issue.storyPoints,
    parentId: issue.parentId ?? null,
    epicId: issue.epicId ?? null,
    updatedAt: issue.updatedAt,
    version: issue.version,
    // Detail-only fields, present when the caller fetched one issue rather than
    // a page. Omitted rather than nulled on a list, so `undefined` honestly
    // means "not included here" instead of "empty".
    ...(detail.description !== undefined ? { description: detail.description } : {}),
    ...(detail.reporter !== undefined
      ? { reporter: detail.reporter ? { id: detail.reporter.id, name: detail.reporter.name } : null }
      : {}),
    ...(detail.dueDate !== undefined ? { dueDate: detail.dueDate } : {}),
    ...(detail.createdAt !== undefined ? { createdAt: detail.createdAt } : {}),
  };
}

export function toPublicComment(comment: CommentDto): PublicComment {
  return {
    id: comment.id,
    issueId: comment.issueId,
    body: comment.body,
    author: comment.author.isAutomation
      ? null
      : { id: comment.author.id, name: comment.author.name },
    automated: Boolean(comment.author.isAutomation),
    createdAt: comment.createdAt,
    updatedAt: comment.editedAt,
  };
}
