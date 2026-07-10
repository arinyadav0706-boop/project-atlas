# Module: Comments

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

Threaded discussion on an issue. V1 supports **one level of threading**
(a top-level comment and its direct replies) — not deeply nested chains —
consistent with Design Principles' preference for clarity over density.

## Business Rules

- BR-1: Any project member (`MEMBER`/`LEAD`) can comment; `VIEWER` can
  read but not post (same read/write split as Issues).
- BR-2: `parentCommentId`, if set, must reference a top-level comment
  (`parentCommentId IS NULL`) on the *same* issue — a reply cannot itself
  be replied to (enforced in the service layer).
- BR-3: `@mention` tokens in `body` are parsed at write-time against
  project members; each mentioned user who is a project member receives a
  `MENTIONED` notification (`10_notifications.md`). No separate `Mention`
  table — this is a write-time side effect, not a queryable relation, in
  V1.
- BR-4: A user can edit or delete their own comment; `LEAD`/`ADMIN` can
  delete any comment (moderation); edits do not re-trigger mention
  notifications for names already present before the edit.
- BR-5: Deleting a top-level comment that has replies soft-deletes it but
  preserves the replies (shown as "[deleted]" author line, replies remain
  legible) rather than cascading the delete.

## Database

`Comment` — `docs/03_Database/01_Database_Design.md §2.10` (includes
`parentCommentId` for one-level threading).

## API

`GET/POST /issues/{issueId}/comments`, `PATCH/DELETE /comments/{commentId}` —
`docs/04_API/openapi.yaml`.

## UI

Comments section within the Issue detail panel (screen #9 in
`docs/05_UI/02_Screens_and_Information_Architecture.md`): top-level
comments in a flat list, each with an inline "Reply" affordance that
renders indented replies directly beneath — no infinite nesting UI to
build. `@mention` autocomplete is scoped to the issue's project members.

## Acceptance Criteria

- Given a project member, when they post a comment mentioning another
  project member, then that member receives a `MENTIONED` notification.
- Given a reply to a top-level comment, when a user attempts to reply to
  that reply, then the UI doesn't offer a "Reply" action on replies (only
  on top-level comments), and the API rejects it if attempted directly.
- Given a top-level comment with two replies, when the author deletes it,
  then it shows as "[deleted]" but the two replies remain visible.

## Validation

`body`: 1–10,000 chars, required, sanitized on render (not on write,
consistent with `04_issues.md`'s Markdown-source decision).
`parentCommentId`: optional, must exist and be top-level on the same
issue (service-layer check).

## Future Scope

- Full nested threading beyond one level.
- Emoji reactions.
- Rich text toolbar beyond Markdown shortcuts.
