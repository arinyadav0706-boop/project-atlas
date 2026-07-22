# Module: Comments

**Status:** v2.0 (MVP spec) · **Owner:** Founding CTO · **Last Updated:** 2026-07-21
· **Decisions:** ADR-0011 (OCC), ADR-0016 (comments architecture)

> Supersedes the Phase-2 draft (which scoped one-level threading + @mentions into
> V1). Those depend on the Notifications module (not yet built) and are on the
> future list; the MVP ships **flat** comments with the threading/mention seams in
> place so they're additive (ADR-0016).

## Overview

Comments are the discussion thread on an **Issue**. The MVP is a flat, chronological
list you can post to, edit your own, and delete. The schema and every layer are built
to grow into the full vision — threaded replies, @mentions, reactions, attachments,
rich text, edit history, visibility, real-time, AI summaries, notifications,
integrations — **additively** (ADR-0016). No speculative tables ship now; the seams do.

## MVP scope

Post a comment on an issue · list comments (chronological, paginated) · edit your own ·
delete your own (a `LEAD` may delete any). Body is Markdown-lite, rendered **escaped**
(no raw HTML — XSS boundary). Deferred (see Future Scope): threaded-reply UI,
@mentions, reactions, attachments, rich-text editor, revision history, visibility,
real-time, AI summaries.

## Business Rules

- **BR-1 (create):** any project `MEMBER`/`LEAD` may comment on an issue in a project
  they can see (F-1 tenant scope). Body is required, trimmed, 1–10 000 chars.
- **BR-2 (list):** comments for an issue, oldest-first, **keyset-paginated** (threads
  grow large). Soft-deleted comments are excluded.
- **BR-3 (edit):** the **author** may edit their own comment; sets `editedAt` and bumps
  `version` (OCC, ADR-0011 — a stale edit gets `409`). Body constraints as BR-1.
- **BR-4 (delete):** the **author** may delete their own comment; a **`LEAD`** may
  delete any (moderation). Soft delete (`deletedAt`) — no hard deletes.
- **BR-5 (archived/read-only):** archived projects are read-only; `VIEWER`/non-members
  read comments but cannot post/edit/delete.
- **BR-6 (audit + event seam):** create/edit/delete record an audit entry and are the
  single place future notifications/real-time/AI hook in (ADR-0016) — no other write
  path.

## Database

Extends the existing `Comment` table (`issueId`, `authorId`, `parentCommentId`, `body`,
audit + soft-delete) with **`bodyFormat`** (`CommentBodyFormat`, default `MARKDOWN`),
**`version`** (OCC), **`editedAt`**, and indexes `([issueId, createdAt])` (ordered
list) + `([parentCommentId])` (future replies). `parentCommentId` already exists —
threading is structural (ADR-0016), rendered flat in the MVP. **No new tables.** See
`docs/03_Database/01_Database_Design.md`.

## API

- **`GET /api/issues/{issueId}/comments?cursor=&take=`** — keyset-paginated list,
  oldest-first. Returns `CommentDto[]` + `nextCursor` + `canComment`.
- **`POST /api/issues/{issueId}/comments`** — create; body `{ body, parentCommentId? }`.
- **`PATCH /api/comments/{commentId}`** — edit own; body `{ body, expectedVersion }`.
- **`DELETE /api/comments/{commentId}`** — delete own (or any, as `LEAD`).

The `CommentDto` is designed to grow (optional `reactions`, `mentions`, `attachments`,
`replyCount` later — ADR-0016). See `docs/04_API/openapi.yaml`.

## UI

A **Comments** section on the issue detail page: a composer (Markdown-lite textarea),
then the list — each row shows author, relative time, an "edited" marker, and (for the
viewer's own, or a `LEAD`) edit/delete controls. Edit is inline; delete confirms.
Load-more paginates. `VIEWER` sees the thread read-only.

## Acceptance Criteria

- A `MEMBER` posts a comment; it appears in the list attributed to them.
- The author edits their comment; it shows "edited" and the new body; a concurrent
  stale edit is rejected (`409`, ADR-0011).
- The author deletes their comment; it disappears (soft delete) and the count drops.
- A `LEAD` can delete another member's comment; a `MEMBER` cannot.
- A `VIEWER` sees comments but has no composer or edit/delete controls; a direct API
  write returns `403`.
- Body renders escaped — a comment containing `<script>` shows as text, not markup.

## Validation

`createCommentSchema`: `body` trimmed 1–10 000; `parentCommentId` optional string.
`updateCommentSchema`: `body` trimmed 1–10 000; `expectedVersion` required (OCC).

## Future Scope (all additive — ADR-0016)

- **Threaded replies** (render nesting off `parentCommentId`); **@mentions**
  (`comment_mentions`, parse-on-write, drives notifications); **reactions**
  (`comment_reactions`); **attachments** (`attachments.commentId`); **rich-text
  editor** (change `bodyFormat` + renderer); **edit history** (`comment_revisions`);
  **visibility** (internal/public); **real-time** (subscribe the event seam);
  **AI summaries** (consume the thread); **external integrations** (API-first).
