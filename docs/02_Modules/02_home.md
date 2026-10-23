# Module: Home

**Status:** v3.1 (personal work dashboard; phases 1–2 built, Quick actions pending) · **Owner:** Founding CTO · **Last Updated:** 2026-10-23
· **Decisions:** ADR-0057 (nine-panel personal dashboard; supersedes ADR-0012's frozen section set), ADR-0012 (unified attention model, still in force)
· **Supersedes:** the "Dashboard" concept (renamed — see §Naming)

## Overview

**Home** is the personal landing page after sign-in. It answers **"What needs
my attention right now, and how much of my work is in flight?"** and lets the
user act in one click. Since ADR-0057 it is a **personal work dashboard**: a
closed set of nine panels about *my* work. Team and organization analytics
still belong in Reports and Dashboards.

Home is still not a configurable gadget grid (the Jira mistake). Its panel set
is fixed by ADR-0057, and every element on it must be backed by real data
(BR-12).

## Naming & information architecture

- Nav label: **Home**. The durable container name that survives every future
  module. The hero content within it is "My Work".
- Reporting/metrics never live here (→ Reports). The org-wide project catalog
  never lives here (→ Projects). See ADR-0012.
- Long-term nav stays lean (~5–7 top-level items); new modules scale via
  **nesting + global search/⌘K + pins**, not new top-level tabs or new Home
  widgets.

## The panel set (ADR-0057)

Home has a **closed set of nine panels**. A tenth panel needs a new ADR.
Modules reach Home through these panels (attention through `AttentionSource`,
events through Recent activity and Upcoming, shortcuts through Quick actions),
never by adding a box.

| # | Panel | Phase | Data |
|---|---|---|---|
| 1 | **Summary**: open, due this week, in progress (+ in review), blocked, completed (30 days) | 1 | `Issue`, `IssueLink`, `AuditLog` (BR-10) |
| 2 | **My Work**: Assigned to me (phase 1); Reported by me, Mentioned (phase 2) | 1 / 2 | `Issue`, `CommentMention` |
| 3 | **Needs your attention**: the unified `AttentionSource` stream (BR-2) | 1 | existing sources |
| 4 | **Your focus**: due soon first, then my highest-priority open work (BR-11). Absorbs "Due soon" | 1 | `Issue` |
| 5 | **Projects**: starred + recent (BR-5); progress and active-sprint counts in phase 2 | 1 / 2 | `Favorite`, `RecentItem`, `Project`, `Sprint` |
| 6 | **Recent activity**: comments and status changes around my work; assignments once audited | 2 | `AuditLog` |
| 7 | **Workload**: my queue compared with my team's, using the Workload module's definitions | 2 | Workload service |
| 8 | **Upcoming**: due dates and sprint dates; meetings only with a calendar source | 2 / 3 | `Issue`, `Sprint` |
| 9 | **Quick actions**: Create issue, Create project, Start sprint, Log time, Invite people, View reports, each shown only to people allowed to use it | 2 | existing endpoints + RBAC |

**Continue working** (BR-3) stays a Home panel until the app sidebar gains
"Recently viewed"; then it moves there.

### Mockup elements we cannot back yet (left out per BR-12)

| Element | Why | Unblocked by |
|---|---|---|
| Trend arrows ("↑2 vs last week") | No weekly history of these counts | Snapshot or audit replay (phase 3 ADR) |
| Meetings (design review, 1:1) in Upcoming / Your focus | No calendar source | Calendar integration (phase 3 ADR) |
| "Today's goal" and its progress ring | Goals are not a concept in EAGLES | Goals model (phase 3 ADR) |
| System alerts ("Payment service failing") | No monitoring feed | Out of scope |
| "PR needs review" attention items | Review requests are not stored | Code integration change (phase 3) |
| Assignments activity tab | Assignee changes are not audited | `ISSUE_ASSIGNEE_CHANGED` audit action (phase 2) |
| Focus mode | No such feature | Out of scope |

## Business Rules

- **BR-1 (My Work):** non-deleted `Issue` rows where `assigneeId = me`, across
  every project I am a `ProjectMember` of, in non-`DONE` statuses by default,
  ordered by (dueDate nulls-last, then priority desc, then updatedAt). Bounded
  (6 on Home since 2026-10-23, so it balances Needs your attention beside it;
  "view all" → filtered Issues list). Tenant-scoped to my org.
- **BR-2 (Needs your attention):** a **unified, ranked stream** of items that
  need me, produced by composing one-or-more **AttentionSource** contributors
  (ADR-0012). V1 sources: *assigned-to-me-recently* and (as they ship)
  *@mentions*, *review requests*, *approvals waiting*. Each item is
  `{ id, kind, title, href, actorId?, occurredAt }`; the section renders them
  uniformly regardless of source. Adding a future source = implementing the
  contract, **not** adding a widget. Bounded to 4 on Home (two-line items
  beside My work's six rows), newest/most-urgent first, with "View all" →
  `/issues?assigneeId=<me>&openOnly=true&sort=UPDATED_DESC`.
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

- **BR-8 (An honest count):** every section is a capped top-N list, and the
  count in its header must never present the cap as the total. Each capped
  query asks for `limit + 1`; the extra row is trimmed and becomes
  `truncated`, which renders the count as **"10+"**. A number that is quietly a
  floor is worse than no number — someone with forty open issues was being told
  they had ten.
- **BR-9 (Every link lands on the same question):** a section's "View all" goes
  to the page that can answer the section, filtered the way the section is.
  "My work" → `/issues?assigneeId=<me>&openOnly=true`; "Due soon" → the same,
  sorted `DUE_DATE_ASC`, which is the closest `IssueFilter` can express (there
  is no due-date facet). A link labelled "View all issues" that lands on the
  project list is a dead end wearing a shortcut's clothes.
- **BR-10 (Summary counts):** all counts cover non-deleted issues **assigned to
  me** in my member projects (BR-7), computed server-side in one request:
  - *Open*: status category ≠ `DONE`.
  - *Due this week*: open, with `dueDate` within the next 7 days **or already
    overdue**. Same window as Your focus, so the two never disagree.
  - *In progress*: category `IN_PROGRESS`. *In review* (category `IN_REVIEW`)
    shows as a secondary line on the same card.
  - *Blocked*: open, with at least one open `BLOCKS` link pointing at it
    (ADR-0046 §3). "Blocked" is a question asked of the link table, never a
    status.
  - *Completed (30 days)*: currently in a `DONE`-category status, and an
    `ISSUE_STATUS_CHANGED` audit row moved it into category `DONE` within the
    last 30 days. Candidates are limited to issues updated in that window, so
    the audit read stays bounded. Counted for the current assignee, so an issue
    reassigned after completion counts for its new assignee.
  - No trend arrows until weekly history exists (BR-12).
- **BR-11 (Your focus):** my open issues due within 7 days or overdue, soonest
  first; then my highest-priority open issues without a near due date, to fill
  the panel. Bounded (~5). No goal ring or meetings (BR-12).
- **BR-13 (My Work tabs):** selected by the `work` URL parameter, so a tab is
  linkable and survives a reload.
  - *Assigned to me* (default): BR-1.
  - *Reported by me*: open issues whose `reporterId` is me, same order as BR-1.
    No "View all": `IssueFilter` has no reporter facet, and a link that lands
    on a different question breaks BR-9.
  - *Mentioned*: open issues with a non-deleted comment that mentions me
    (`CommentMention`), most recent mention first. No "View all", for the same
    reason.
- **BR-14 (Recent activity):** what other people did to my work in the last 14
  days, newest first, capped at 5 on Home so it sits level with Workload (BR-8). "My work" means non-deleted issues
  in my member projects where I am the assignee or the reporter. The candidate
  set is the 500 most recently updated of them, which keeps every read bounded.
  Three event kinds:
  - *Comment*: a non-deleted comment on one of those issues, from the
    `Comment` table, with a plain-text excerpt. A comment a rule posted shows
    as "An automation".
  - *Status change*: an `ISSUE_STATUS_CHANGED` audit row, showing the new
    status's name.
  - *Assignment*: an `ISSUE_ASSIGNEE_CHANGED` audit row (recorded since
    2026-10-23, HOME-5).

  My own actions are excluded. Tabs (All, Comments, Status changes,
  Assignments) are selected by the `activity` URL parameter.
- **BR-15 (Project cards):** each strip project shows total non-deleted issues,
  % done (DONE-category issues ÷ total), active sprints and member count. These
  come from three grouped queries no matter how many cards there are, never
  one query per card.
- **BR-16 (Upcoming):** the next 14 days, in date order, capped at 6: due dates
  of my open issues, plus start dates of PLANNED sprints and end dates of ACTIVE
  sprints in my member projects. No meetings (BR-12).
- **BR-17 (Workload panel):** my own queue, using the Workload module's
  definitions: remaining effort ÷ weekly capacity, the same status bands, and
  unestimated issues counted but never guessed. Home shows **no team
  comparison**. Workload only lets team managers and admins see other people's
  load (Workload BR-8), and a team median on everyone's Home would leak that
  through the back door. People who can open the Workload page get a link to
  it.
- **BR-12 (Real data or nothing):** no element on Home ships with sample,
  estimated or decorative values. An element whose data does not exist is left
  out (see "Mockup elements we cannot back yet"), never imitated.

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

- **`GET /api/home`** → `HomeDto`: composes all panels server-side in
  parallel, each bounded. Capped lists come back as `HomeList`
  (`{ items, truncated }`, BR-8).
  ```
  HomeDto {
    summary: HomeSummaryDto            // BR-10
    myWork: HomeList<IssueListItemDto>
    attention: HomeList<AttentionItemDto>
    continueWorking: IssueListItemDto[]
    focus: HomeList<IssueListItemDto>     // Your focus (BR-11); replaces dueSoon
    activity: HomeList<ActivityItemDto>   // BR-14, default tab
    upcoming: UpcomingItemDto[]           // BR-16
    workload: PersonalWorkloadDto         // BR-17
    starredProjects: HomeProjectDto[]     // each with stats (BR-15)
    recentProjects: HomeProjectDto[]
  }
  ActivityItemDto = { id, kind: COMMENT | STATUS | ASSIGNMENT, occurredAt,
    occurredAgo, actor | null, issue { id, key, title, projectId }, href }
    + excerpt (COMMENT) | status (STATUS) | assignee, toMe (ASSIGNMENT)
  UpcomingItemDto = { id, kind: DUE | SPRINT_START | SPRINT_END, date, title,
    context, href }
  PersonalWorkloadDto = { openIssues, unestimated, remainingMinutes,
    weeksOfWork, status, workingWeek, truncated, canViewTeam }
  HomeSummaryDto {
    open: number; dueThisWeek: number; inProgress: number;
    inReview: number; blocked: number; completedLast30Days: number
  }
  ```
- **`POST /api/projects/{projectId}/star`** / **`DELETE …/star`**: toggle a
  `Favorite` for the current user (RBAC: any member who can see the project).
- **Interaction capture:** opening an issue upserts a `RecentItem`
  (fire-and-forget; may move off the hot path at scale, like audit). No separate
  public endpoint required in V1.

See `docs/04_API/openapi.yaml`.

## UI

Layout follows the management-approved mockup (design canvas "0 · Home"). A
greeting header with today's date, then the Summary row; below it a main
column (My Work beside Needs your attention, then Projects, then Recent
activity beside Workload) and a right rail (Your focus, Upcoming, Continue
working; Quick actions once built). Below about 1100px the rail drops under the main column, and side-by-side
pairs stack. **Each panel is its own streamed `<Suspense>` boundary** (the
Performance doc pattern). Every list is bounded, with a "View all" link to the
page that answers the same question (BR-9). Panels 1–8 and Continue working
render today. Quick actions waits on HOME-9. Panel tabs are links that change
one URL parameter each (`work`, `activity`), so switching one panel never
resets another.
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
- Given 3 open issues assigned to me (one IN_PROGRESS, one IN_REVIEW, one TODO
  due tomorrow) and one DONE issue I completed yesterday, when I open Home, then
  Summary shows open 3, due this week 1, in progress 1 (+1 in review),
  completed 1.
- Given an open issue of mine with an open blocker, when the blocker moves to
  DONE, then Blocked drops by one on the next load.
- Given an issue assigned to me in a project I am no longer a member of, when I
  open Home, then no Summary count includes it.
- Given no data source exists for an element in the mockup (trend, meeting,
  goal), when Home renders, then that element is absent, never shown with a
  placeholder value.

## Validation

Star toggle: `projectId` must reference a non-deleted project in my org that I
can see. All reads are org/membership-scoped server-side (BR-7). Bounds
(`take`) are capped constants, never client-controlled beyond the cap.

## Future Scope

- **Phase 2 (ADR-0057):** built 2026-10-23: Reported by me / Mentioned tabs,
  Recent activity, `ISSUE_ASSIGNEE_CHANGED` auditing, project card stats,
  personal Workload panel, Upcoming. Still open: Quick actions (HOME-9), which
  needs a project-agnostic Create issue flow and the project-create permission
  decision.
- **Phase 3 (each its own ADR):** trend arrows, calendar meetings, goals, PR
  review requests, focus mode.

- Attention sources: @mentions, review requests, approvals-waiting, goal check-ins
  — each an `AttentionSource` implementation, no Home redesign (ADR-0012).
- `RecentItem`/`Favorite` extend to non-issue entities (docs, etc.) via
  `entityType`.
- Global command palette (⌘K) + global search as the primary at-scale navigation.
- Richer Continue-working (multi-signal history, cross-device).
- Move `RecentItem` upserts off the request hot path (queue) at volume.
