# ADR-0008: Board is a Project-Level View with Composable Filters

**Status:** Accepted
**Date:** 2026-07-19
**Deciders:** Founding CTO (this document), founder decision (Option B + refinement)

## Context

The original Board spec (`05_board.md` v1) tied the Board to a single **sprint**:
it showed one sprint's issues and, with no active sprint, an empty state pointing
to the Backlog. But Sprints are a later module — nothing sets `sprintId` yet — so
a sprint-scoped board would be permanently empty today, forcing us to build
Backlog & Sprint first.

More importantly, EAGLES must serve **both** Kanban teams (no sprints) and Scrum
teams (sprint-based), and we will later add Epic, Assignee, Label, and Saved
Filter views. Building the board around *sprint* specifically would force a
redesign each time another way of scoping is added.

## Decision

The Board is a **project-level visualization** of a project's issues grouped into
the four fixed status columns. **Scoping is a composable set of filters applied
server-side; Sprint is just one optional filter, not the board's identity.**

One query contract and one UI component serve every filter combination:

- **Filter contract** (`BoardFilter`, extensible):
  `{ sprintId?, epicId?, assigneeId?, type?, priority?, labelIds?, search? }`
  → the board repository translates it to a single Prisma `where`. Adding a new
  filter = adding a field here + a control in the filter bar; **no board rewrite.**
- **`GET /projects/{projectId}/board?<filters>`** returns the four columns, each
  ordered by `rank` (ADR-0009), plus per-status counts.
- **UI**: a filter-agnostic `<Board columns filter onFilterChange canWrite />`
  component, with a `<BoardFilterBar>` that renders whichever filters are
  currently available.

**V1 ships** the full filter plumbing plus the filters whose data already exists
(assignee, type, priority). Sprint and Epic filters *activate* when those
features land (Phase 5 / epics); Label filter when Labels ship; **Saved Filters**
becomes a stored, named `BoardFilter` (future table) reusing the same contract.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Sprint-scoped board (original spec) | Empty today (no sprints); forces Sprints first; needs redesign to support Kanban and other scopings. |
| A separate board implementation per scope (sprint board, epic board, …) | Duplicated query + UI; diverging behaviour; the opposite of reuse. |
| Client-side-only filtering of a full fetch | Doesn't scale (fetches everything); breaks pagination/caps; filter logic belongs server-side next to RBAC. |

## Consequences

- **Positive:** one board component + one query for all views; Kanban usable now,
  Scrum (sprint filter) and Epic/Label/Saved-Filter views layer on with **zero
  redesign**; filters compose (e.g., sprint + assignee); keeps roadmap order
  (Board in Phase 4, Sprints in Phase 5).
- **Negative / trade-offs accepted:** a filtered drag-reorder positions a card
  relative to its **visible** neighbours only — a hidden card between them keeps
  its own rank. This is the standard, acceptable behaviour for filtered boards
  and is documented in `05_board.md`.
- **Follow-up actions:**
  - `05_board.md` rewritten to this model (project-level + `BoardFilter`).
  - Sprint filter wired in Phase 5; Saved Filters table is a future item (ledger
    FUT + roadmap).
  - Each board column is **bounded** (capped per column) — see Performance doc;
    per-column "load more" is a future enhancement.

## Amendment — 2026-08-07: the filter is shared, not the Board's

This ADR argued a composable filter would make new scopes a control rather than
a redesign. That held: Sprint, Epic, Labels and Components all landed as
controls, and FUT-4 is closed.

What the ADR did not anticipate is a **second consumer**. When the Backlog
needed search and filters, copying `BoardFilter`, `boardWhere()` and
`boardFilterSchema` would have created two filter languages that drift — one
would eventually disagree about what a blank `?search=` means, or spell
`labelIds` differently.

So all three move to `features/issues`, which owns the domain:

| Concern | Home |
|---|---|
| Shape | `types/issue-filter.types.ts` → `IssueFilter` |
| Prisma `where` | `repositories/issue-filter.repository.ts` → `issueFilterWhere()` |
| Query parse | `validation/issue-filter.schemas.ts` → `parseIssueFilter()` |
| Query serialise | `lib/issue-filter-query.ts` → `issueFilterToQuery()` |

`BoardFilter` and `boardFilterSchema` remain as aliases, so the Board's own docs
and call sites still read naturally. **Adding a filter is now one field plus one
control, for every list view at once.**

Two consequences worth recording:

- **The Backlog ignores `sprintId`** — it *is* the unsprinted set. The
  repository pins `sprintId: null` after the filter spread, so no caller can
  widen it.
- **Reordering is disabled while a backlog filter is active.** `rank` is a
  position in the whole list; a drop between two visible rows with hidden rows
  between them does something the user did not intend. Jira takes the same line.
