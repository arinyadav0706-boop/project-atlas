import type {
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// DTOs for issue dependencies (ADR-0046, docs/02_Modules/27_dependencies.md).

export type IssueLinkTypeDto = "BLOCKS" | "RELATES_TO" | "DUPLICATES";

/**
 * How a link reads from the page you are standing on.
 *
 * The stored row is one direction; each end of it is a different sentence.
 * `BLOCKS` seen from the target is `IS_BLOCKED_BY`, and a reader should never
 * have to work that out from an arrow glyph.
 */
export type LinkRelationDto =
  | "BLOCKS"
  | "IS_BLOCKED_BY"
  | "RELATES_TO"
  | "DUPLICATES"
  | "IS_DUPLICATED_BY";

/** The sentence each relation makes, as a group heading. */
export const RELATION_LABEL: Record<LinkRelationDto, string> = {
  BLOCKS: "Blocks",
  IS_BLOCKED_BY: "Blocked by",
  RELATES_TO: "Relates to",
  DUPLICATES: "Duplicates",
  IS_DUPLICATED_BY: "Duplicated by",
};

/** Reading order on the panel: what is in your way comes first. */
export const RELATION_ORDER: LinkRelationDto[] = [
  "IS_BLOCKED_BY",
  "BLOCKS",
  "RELATES_TO",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
];

/**
 * The issue at the other end of a link.
 *
 * `restricted` is the honest answer for a link into a project the viewer cannot
 * see (BR-6): the link is real and hiding it would make the list silently
 * incomplete, but nothing about the issue leaks — not even its title.
 */
export type LinkedIssueDto =
  | {
      restricted: false;
      id: string;
      key: string;
      title: string;
      type: IssueTypeDto;
      status: IssueStatusDto;
      priority: IssuePriorityDto;
      projectId: string;
      projectKey: string;
      assignee: { id: string; name: string; avatarUrl: string | null } | null;
    }
  | { restricted: true; id: null; key: null };

export interface IssueLinkDto {
  /** The link row's id — what DELETE takes. */
  id: string;
  relation: LinkRelationDto;
  issue: LinkedIssueDto;
  /** True when this is an unfinished blocker of the issue being viewed. */
  blocking: boolean;
}

export interface IssueLinksDto {
  links: IssueLinkDto[];
  /**
   * Open blockers of this issue, by key — what the "mark done anyway?" confirm
   * names, and what the blocked badge counts (BR-8, BR-13).
   */
  openBlockerKeys: string[];
}
