# ADR-0016: Comments — Extensible Architecture

**Status:** Accepted
**Date:** 2026-07-21
**Deciders:** Founding CTO; founder direction (Jira-class, production-grade, future-proof)

## Context

Comments are the discussion layer on an issue and, long-term, a hub for a large
feature set: threaded replies, @mentions, emoji reactions, file attachments, a
rich-text editor, edit history, visibility/permissions, real-time updates,
AI-generated summaries, notifications, and external integrations.

The MVP must be lean — create/list/edit/delete a comment on an issue — but **every
layer has to be extensible so those features are additive, not rewrites.** The risk
is the opposite failure modes: (a) shipping a flat model that forces migrations and
refactors later, or (b) over-building speculative tables now (violates "no premature
abstraction", CLAUDE.md #10). This ADR draws that line.

The `comments` table already exists with a self-referential `parentCommentId` —
threading is structurally present from day one.

## Decision

**A single, well-factored Comment write path with structural seams for the future,
but no speculative tables.**

1. **Ownership & shape.** A comment belongs to one `Issue` (`issueId`) and has a
   `authorId`. Threading uses the existing self-referential **`parentCommentId`**
   (nullable). The MVP renders a **flat** list; the column is the backbone so
   nested threading is a UI/query change later, not a migration. We do **not** make
   comments polymorphic across entity types now (YAGNI) — if comments on other
   entities are ever needed, add `entityType/entityId` in a migration; the service
   is the only write path, so that change is contained.

2. **Body & rich text.** Store `body` as text plus a **`bodyFormat`** enum
   (`PLAIN` | `MARKDOWN`, default `MARKDOWN`). The MVP treats the body as safe,
   escaped Markdown-lite (no raw HTML — XSS boundary). A future rich-text editor
   changes the *format value and the renderer*, not the schema.

3. **Edit & history.** MVP records **`editedAt`** (an "edited" indicator) and a
   **`version`** integer for optimistic concurrency (ADR-0011) — consistent with
   issues and a prerequisite for future real-time/collaborative editing. Full
   revision history (a `comment_revisions` table) is a **documented future
   extension**, not built now.

4. **Extension tables — deferred by decision (each added when its feature ships):**
   - **Reactions** → `comment_reactions(commentId, userId, emoji)`.
   - **Mentions** → `comment_mentions(commentId, userId)`, populated by parsing the
     body on write; drives notifications.
   - **Attachments** → the existing `attachments` table gains a nullable
     `commentId` when the Attachments module lands.
   - **Visibility** → a `visibility` enum (e.g. internal/public) — only meaningful
     once there is a second audience (external/customer portal). YAGNI for V1.
   The **`CommentDto` is designed to grow**: optional fields (`reactions`,
   `mentions`, `attachments`, `replyCount`) can be added without breaking clients.

5. **One write path + an event seam.** All mutations go through `CommentService`
   (repository pattern, RBAC, OCC). Create/edit/delete record an **audit-log**
   entry today and are the natural place a future **event emission** hooks in — so
   Notifications (@mention pings), real-time push, AI summaries, and external
   integrations subscribe to comment events **without touching comment internals**.
   MVP does not build an event bus (YAGNI); it isolates the seam to one method.

6. **Permissions.** Enforced server-side in the service: any project `MEMBER`/`LEAD`
   may comment; an author may edit/delete their own comment; a `LEAD` may delete
   any (moderation). `VIEWER`/non-members are read-only (comments are org-visible
   with the project, F-1). This mirrors the Issues RBAC and extends cleanly to a
   future `visibility` dimension.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Flat model now, add threading later** | `parentCommentId` already exists and is free; dropping it would force a migration + query rewrite exactly when threading is wanted. |
| **Build reactions/mentions/revisions tables up front** | Speculative schema for unshipped features (CLAUDE.md #10); each is cleanly additive later behind the same service. |
| **Store rendered HTML** | XSS surface + lock-in to one editor; storing source + `bodyFormat` keeps rendering a presentation concern. |
| **Polymorphic comments (entityType/entityId) now** | No second comment target in V1; adds join complexity and index cost for nothing. Contained behind the service if ever needed. |

## Consequences

- **Positive:** a small MVP whose schema and layers already carry the future's
  backbone (threading, format, versioning, event seam); every listed future feature
  is an additive table/field + a service extension, not a rewrite; one audited write
  path; XSS-safe rendering boundary.
- **Negative / trade-offs accepted:** three additive columns (`bodyFormat`,
  `version`, `editedAt`) ship before the features that fully use them — deliberate,
  minimal, and justified by the stated roadmap (not speculative tables).
- **Follow-up actions:**
  1. Additive migration: `CommentBodyFormat` enum + the three columns + indexes.
  2. Feature: repository (keyset list, OCC edit), service (RBAC + audit + seam),
     `GET/POST /issues/{id}/comments`, `PATCH/DELETE /comments/{id}`.
  3. Comments section on the issue detail page (flat list + composer + edit/delete).
  4. When each future feature lands, add its table/field + a `CommentDto` field +
     a service method — no change to existing callers.
