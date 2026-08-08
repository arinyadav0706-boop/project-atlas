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
(no raw HTML — XSS boundary). **v2.0 (ADR-0038) adds @mentions, participant
notifications, and one-level reply threads with their own overflow page.** Deferred
(see Future Scope): reactions, comment attachments, rich-text editor, revision history,
visibility, real-time, AI summaries.

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
- **BR-7 (mentions, ADR-0038 §1–2):** a body may name any number of people as
  `@[Name](user:<id>)` tokens — **no cap**, because naming a whole team is a
  legitimate use and a limit is felt exactly when the tool matters most. Every id
  is re-checked server-side against active users in the actor's organization; ids
  that fail are dropped, never notified. `comment_mentions` is a **derived index**
  over the body, rebuilt on every edit.
- **BR-8 (recipients, ADR-0038 §3):** a new comment notifies the assignee, the
  reporter, and **everyone who has previously commented on the issue**. Someone both
  mentioned and a participant gets **one** notification, typed `MENTIONED` —
  precedence, not two rows. An **edit** notifies only the people it newly named.
- **BR-9 (threads, ADR-0038 §4–5):** replies attach to a **top-level** comment; a
  reply to a reply re-parents to the same root, so threads are always one deep. The
  issue page shows each root with its **newest 3** replies; beyond that, `View all N
  replies` links to the thread's own page. Deleting a root soft-deletes its replies.
- **BR-6 (audit + event seam):** create/edit/delete record an audit entry and are the
  single place future notifications/real-time/AI hook in (ADR-0016) — no other write
  path.

## Database

Extends the existing `Comment` table (`issueId`, `authorId`, `parentCommentId`, `body`,
audit + soft-delete) with **`bodyFormat`** (`CommentBodyFormat`, default `MARKDOWN`),
**`version`** (OCC), **`editedAt`**, and indexes `([issueId, createdAt])` (ordered
list) + `([parentCommentId])` (future replies). `parentCommentId` already exists —
threading is structural (ADR-0016) and **rendered as threads from ADR-0038**.

**v2.0 adds one table, `comment_mentions`** (`commentId`, `userId`, audit fields,
unique on `(commentId, userId)`, indexed `(userId, createdAt)` for "mentions of me").
Index changes: `comments([parentCommentId])` → `([parentCommentId, createdAt])` so
reply pages and counts are ordered seeks, plus
`comments([issueId, parentCommentId, createdAt])` for the top-level list, plus
`notifications([userId, createdAt, id])` (PERF-9 — the history page's sort was never
covered). See `docs/03_Database/01_Database_Design.md`.

## API

- **`GET /api/issues/{issueId}/comments?cursor=&take=`** — keyset-paginated list,
  oldest-first. Returns `CommentDto[]` + `nextCursor` + `canComment`.
- **`POST /api/issues/{issueId}/comments`** — create; body `{ body, parentCommentId? }`.
- **`PATCH /api/comments/{commentId}`** — edit own; body `{ body, expectedVersion }`.
- **`DELETE /api/comments/{commentId}`** — delete own (or any, as `LEAD`).
- **`GET /api/comments/{commentId}/thread?cursor=&take=`** — one thread: the root plus
  a keyset page of every reply, with the issue breadcrumb. `404` for a reply id —
  only a root has a thread.
- **`GET /api/issues/{issueId}/mentionable?q=`** — autocomplete candidates, org-scoped,
  project members first. Not a directory.

The list response now carries `totalCount`; each `CommentDto` carries `mentions`,
`replyCount`, and (on a root) a `replies` preview. See `docs/04_API/openapi.yaml`.

## UI

A **Comments** section on the issue detail page: a composer, then the list — each row
shows author, relative time, an "edited" marker, and (for the viewer's own, or a
`LEAD`) edit/delete controls. Edit is inline. Load-more paginates. `VIEWER` sees the
thread read-only.

**Composer:** typing `@` opens a debounced autocomplete (↑/↓, Enter/Tab to pick, Esc to
dismiss); picking inserts a token. ⌘/Ctrl+Enter submits. The textarea holds the raw
body including tokens — a deliberate trade against a contenteditable editor, which
renders pills while typing but brings selection, paste and IME bugs a textarea does
not have.

**Threads:** each root renders its newest 3 replies indented under it, with a `Reply`
action. Past that, `View all N replies` navigates to
`/projects/{projectId}/issues/{issueId}/comments/{commentId}` — a real page, so a long
discussion is linkable and the issue page's cost stays constant.

**Mentions render as chips**, never links (a mention of a deactivated colleague must
still read cleanly). The XSS boundary is unchanged: text segments are React children
and a chip is built from an id-shaped capture, so nothing reaches
`dangerouslySetInnerHTML`.

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
