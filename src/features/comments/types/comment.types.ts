// DTOs returned to the client — never the raw Prisma model.

export type CommentBodyFormatDto = "PLAIN" | "MARKDOWN";

export interface CommentAuthorDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  /**
   * True when the "author" is an automation rule, not a person (ADR-0050 §4).
   *
   * The UI badges it rather than showing an avatar, because a reader who thinks
   * a teammate wrote the escalation checklist will go and ask that teammate
   * about it.
   */
  isAutomation?: boolean;
}

// A person the comment names (ADR-0038 §1). Resolved from the body's tokens, so
// the name shown is the *current* one — the token stores the id, and a rename
// re-resolves rather than rewriting history.
export interface CommentMentionDto {
  userId: string;
  name: string;
}

// The comment shape. Designed to grow (ADR-0016): future `reactions` and
// `attachments` are optional additions that won't break clients.
export interface CommentDto {
  id: string;
  issueId: string;
  // Null for a top-level comment; otherwise the root it hangs off. Threads are
  // one level deep (ADR-0038 §4) — a reply to a reply re-parents to the root.
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
  // Who this comment names, for rendering chips without a second lookup.
  mentions: CommentMentionDto[];
  // Total replies on this root — 0 on a reply, since threads are one deep.
  replyCount: number;
  /**
   * The newest few replies, for the issue page (ADR-0038 §5). Present only on a
   * root in a list response, and always in reading order. When `replyCount`
   * exceeds this length the UI links to the thread page rather than loading
   * the rest inline.
   */
  replies: CommentDto[];
}

// One keyset-paginated page of top-level comments (oldest-first) plus the cursor.
export interface CommentPageDto {
  items: CommentDto[];
  nextCursor: string | null;
  // Whether the viewer may post a comment (MEMBER/LEAD on a non-archived project).
  canComment: boolean;
  // Every top-level comment on the issue, for the "N comments" heading.
  totalCount: number;
}

// One thread's own page: the root plus a keyset page of all its replies.
export interface CommentThreadDto {
  root: CommentDto;
  replies: CommentDto[];
  nextCursor: string | null;
  canComment: boolean;
  replyCount: number;
  // For the breadcrumb back to the issue, without a second request.
  issue: { id: string; key: string; title: string; projectId: string };
}

// An autocomplete candidate, ranked participants → project members → org.
export interface MentionableUserDto {
  id: string;
  name: string;
  /** Second line in the menu — the only way to tell two same-named people apart. */
  email: string;
  avatarUrl: string | null;
  isProjectMember: boolean;
  /** Assignee, reporter or a prior commenter on this issue. */
  isParticipant: boolean;
}

export interface MentionableListDto {
  items: MentionableUserDto[];
  /**
   * How many people match the search in total, not just the page shown. Lets
   * the menu say "8 of 34 — keep typing" instead of implying the organisation
   * has eight people in it.
   */
  totalMatches: number;
}
