// DTOs returned to the client — never the raw Prisma model.

export type CommentBodyFormatDto = "PLAIN" | "MARKDOWN";

export interface CommentAuthorDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// The comment shape. Designed to grow (ADR-0016): future `reactions`, `mentions`,
// `attachments`, and `replyCount` are optional additions that won't break clients.
export interface CommentDto {
  id: string;
  issueId: string;
  // Threading backbone (ADR-0016); null for a top-level comment. MVP renders flat.
  parentCommentId: string | null;
  body: string;
  bodyFormat: CommentBodyFormatDto;
  author: CommentAuthorDto;
  createdAt: string;
  // Set once the comment has been edited (an "edited" indicator).
  editedAt: string | null;
  // Optimistic-concurrency token (ADR-0011); the client sends it back on edit.
  version: number;
  // The viewer's rights on this comment, resolved server-side.
  canEdit: boolean;
  canDelete: boolean;
}

// One keyset-paginated page of comments (oldest-first) plus the cursor.
export interface CommentPageDto {
  items: CommentDto[];
  nextCursor: string | null;
  // Whether the viewer may post a comment (MEMBER/LEAD on a non-archived project).
  canComment: boolean;
}
