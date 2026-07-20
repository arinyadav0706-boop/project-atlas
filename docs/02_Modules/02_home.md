# Module: Home

**Status:** v2.0 (design ratified) · **Owner:** Founding CTO · **Last Updated:** 2026-07-20
· **Decisions:** ADR-0012 (unified attention model)
· **Supersedes:** the "Dashboard" concept (renamed — see §Naming)

## Overview

**Home** is the personal landing page after sign-in. Its single job is to answer
one question — **"What needs my attention right now?"** — and let the user *act*
on it in one click. It is an **action launchpad, not a monitoring console.**

Home is deliberately **not** called "Dashboard": that word invites a passive grid
of charts/gadgets (the Jira mistake). Reporting and charts live in the future
**Reports** module; Home is for *doing*, scoped to the current user.

## Naming & information architecture

- Nav label: **Home**. The durable container name that survives every future
  module. The hero content within it is "My Work".
- Reporting/metrics never live here (→ Reports). The org-wide project catalog
  never lives here (→ Projects). See ADR-0012.
- Long-term nav stays lean (~5–7 top-level items); new modules scale via
  **nesting + global search/⌘K + pins**, not new top-level tabs or new Home
  widgets.

## The frozen widget set (ADR-0012)

Home has a **fixed set of sections**. Future modules (Sprint, Backlog, Roadmap,
Goals, Approvals, Forms, Portfolio, Knowledge Base, Time Tracking, …) **feed
these sections; they never add new Home widgets.** This is the load-bearing rule
that keeps Home calm at V5 (ADR-0012).

1. **My Work** — issues assigned to me, across all my projects.
2. **Needs your attention** — the unified attention inbox (the extension point).
3. **Continue working** — what I was actively working on.
4. **Due soon** — my time-sensitive items.
5. **Starred + recent projects** — a small personal navigation strip (never the
   catalog).

## Business Rules

- **BR-1 (My Work):** non-deleted `Issue` rows where `assigneeId = me`, across
  every project I am a `ProjectMember` of, in non-`DONE` statuses by default,
  ordered by (dueDate nulls-last, then priority desc, then updatedAt). Bounded
  (default 10, "view all" → filtered Issues list). Tenant-scoped to my org.
- **BR-2 (Needs your attention):** a **unified, ranked stream** of items that
  need me, produced by composing one-or-more **AttentionSource** contributors
  (ADR-0012). V1 sources: *assigned-to-me-recently* and (as they ship)
  *@mentions*, *review requests*, *approvals waiting*. Each item is
  `{ id, kind, title, href, actorId?, occurredAt }`; the section renders them
  uniformly regardless of source. Adding a future source = implementing the
  contract, **not** adding a widget. Bounded, newest/most-urgent first.
- **BR-3 (Continue working):** my most recently *engaged* issues, from the
  `RecentItem` signal (§Database), excluding items I've completed. Ranking is a
  **recency-weighted engagement score** (see §Continue-working algorithm), not
  raw "last viewed". Bounded (~5).
- **BR-4 (Due soon):** my assigned, non-`DONE` issues with a `dueDate` within a
  rolling window (default 7 days, plus overdue), soonest first. Bounded.
- **BR-5 (Projects strip):** **Starred** projects (explicit, via `Favorite`) +
  **recent** projects (from `RecentItem`, entityType PROJECT), `ACTIVE` only,
  deduped, bounded (~6). This is navigation, **not** the catalog — the full,
  searchable list is the Projects module.
- **BR-6 (Empty state):** a user with no assigned work / no history sees a
  purposeful onboarding state (create/join a project, pick up an issue), never a
  wall of empty widgets or zeros.
- **BR-7 (Scope & privacy):** every section is scoped to the caller's
  organization and to projects they can see; an item from a project the user is
  not a member of never appears (defense-in-depth: service-layer scope + the
  same tenant checks used elsewhere, F-1).

## Continue-working algorithm (BR-3)

Feels *magical, not random* because it ranks **active engagement**, not cursor
touches:

- Source: `RecentItem` (one row per user×entity, upserted on interaction).
- Score = `weight(interactionType) × timeDecay(now − lastInteractedAt)`, where
  `EDITED/COMMENTED/TRANSITIONED > ASSIGNED/MENTIONED > VIEWED`, and decay makes
  an hour-old edit outrank a week-old view.
- **Exclude** completed/closed issues and soft-deleted rows.
- Cap ~5, deduped, one-click resume.
- V1 stores the *latest* interaction's type + time per item (documented
  limitation: an old edit followed by a fresh view ranks as the view); richer
  multi-signal history is a future enhancement, not needed for a strong V1.

## Database

Reads `Issue`, `Project`, `ProjectMember`, `AuditLog` (all existing). Adds **two
small, generic, per-user tables** (see `docs/03_Database/01_Database_Design.md`):

- **`RecentItem`** — implicit engagement signal: `(userId, entityType, entityId,
  interactionType, lastInteractedAt, organizationId)`, unique
  `(userId, entityType, entityId)`, upserted on interaction; indexed
  `(userId, lastInteractedAt desc)`. Generic `entityType` (ISSUE now; extensible
  to future entities). **Distinct from `AuditLog`** — AuditLog is the immutable
  compliance record of *changes*; `RecentItem` is a mutable personal *navigation*
  signal (views included). Conflating them would bloat the audit log — kept
  separate on purpose.
- **`Favorite`** — explicit pin: `(userId, entityType, entityId, createdAt)`,
  unique `(userId, entityType, entityId)`, indexed `(userId, entityType)`.
  Generic (PROJECT now; extensible to issues/docs later).

No changes to existing entities.

## API

- **`GET /api/home`** → `HomeDto` — composes all sections server-side in
  parallel, each bounded. Sections that depend on not-yet-built modules return
  empty arrays (the contract is stable from day one).
  ```
  HomeDto {
    myWork: IssueListItemDto[]
    attention: AttentionItemDto[]
    continueWorking: IssueListItemDto[]
    dueSoon: IssueListItemDto[]
    starredProjects: ProjectSummaryDto[]
    recentProjects: ProjectSummaryDto[]
  }
  ```
- **`POST /api/projects/{projectId}/star`** / **`DELETE …/star`** — toggle a
  `Favorite` for the current user (RBAC: any member who can see the project).
- **Interaction capture:** opening an issue upserts a `RecentItem`
  (fire-and-forget; may move off the hot path at scale, like audit). No separate
  public endpoint required in V1.

See `docs/04_API/openapi.yaml`.

## UI

Screen #2 in `docs/05_UI/02_Screens_and_Information_Architecture.md`. Calm,
action-first, single column of sections in priority order (My Work → Attention →
Continue → Due soon → Projects). **Each section is its own streamed
`<Suspense>` boundary** (shell + fast sections paint immediately; slow ones
stream in) — the pattern locked by the Performance doc. Every list is bounded
with a "view all" link to the relevant module. Nav item **Dashboard → Home**;
`/dashboard` redirects to `/home`.

## Acceptance Criteria

- Given issues assigned to me across two projects, when I open Home, then My Work
  shows them (bounded, ordered by due/priority), each a one-click open.
- Given I edited issue A yesterday and viewed issue B a minute ago, when I open
  Home, then Continue working ranks by engagement+recency (not raw view time).
- Given I star a project, when I reload Home, then it appears in the starred
  strip and persists; unstarring removes it.
- Given an issue in a project I am **not** a member of, when I open Home, then it
  never appears in any section.
- Given a brand-new user with no work, when I open Home, then I see a purposeful
  empty/onboarding state, not empty widgets.
- Given a future module (e.g. Approvals) adds an AttentionSource, when it ships,
  then its items appear in "Needs your attention" with **no change to Home's
  structure**.

## Validation

Star toggle: `projectId` must reference a non-deleted project in my org that I
can see. All reads are org/membership-scoped server-side (BR-7). Bounds
(`take`) are capped constants, never client-controlled beyond the cap.

## Future Scope

- Attention sources: @mentions, review requests, approvals-waiting, goal check-ins
  — each an `AttentionSource` implementation, no Home redesign (ADR-0012).
- `RecentItem`/`Favorite` extend to non-issue entities (docs, etc.) via
  `entityType`.
- Global command palette (⌘K) + global search as the primary at-scale navigation.
- Richer Continue-working (multi-signal history, cross-device).
- Move `RecentItem` upserts off the request hot path (queue) at volume.
