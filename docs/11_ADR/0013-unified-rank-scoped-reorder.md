# ADR-0013: One Rank, Many Views — Scoped Reorder for Board & Backlog

**Status:** Accepted
**Date:** 2026-07-20
**Deciders:** Founding CTO; founder direction (Jira-grade, future Scrum/board types)

## Context

The Board (ADR-0008/0009) orders a project's issues by a string `rank`, grouped
by status. The **Backlog** must order the *same* project's *unscheduled* issues
(`sprintId = null`). Soon a **Sprint board** (Phase 5) will order a *sprint's*
issues. These are all views over one entity; the question is how ordering is
stored and how reordering validates across views.

Two shapes were possible: **one rank per issue** shared by every view (Jira's
model), or a **separate rank column per view** (boardRank, backlogRank, …). And
reorder needs to know which view's neighbours it is positioning between — the
Board validates neighbours by destination *status*, but the Backlog's neighbours
span statuses and are defined by `sprintId = null`.

## Decision

**Keep a single `rank` per issue; every view orders by it under its own filter.**
Board groups by `status`; Backlog filters `sprintId = null`; a future Sprint board
filters `sprintId = X` — all `ORDER BY rank`. Moving an issue is always the same
one-row, OCC-guarded write (`generateKeyBetween` between the neighbours' ranks).

Reorder carries an explicit **`scope`** that selects neighbour validation:
- `board` (**default**, backward-compatible) — neighbours must be in the same
  project **and destination status**; a drop may also change status.
- `backlog` — neighbours must be in the same project **and unscheduled**
  (`sprintId = null`); no status change.

Adding a view later (e.g. `sprint`) is a new scope + a matching repository
lookup — **no change to existing callers** (the Board keeps working via the
default). A covering index `issues(projectId, sprintId, rank)` serves the backlog
query.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Separate rank column per view** (boardRank, backlogRank) | Two+ orderings to keep mutually consistent; moving an item in one view drifts from the other; more schema, more bugs. Jira uses one rank for exactly this reason. |
| **Relax neighbour validation to project-only** (no scope) | Simple, but silently drops the Board's guarantee that you can only reorder relative to cards in the destination column (BR-4) — a real safety/consistency regression. |
| **A separate backlog-reorder endpoint/method** | Duplicates the rank + OCC write logic; `scope` reuses one code path. |

## Consequences

- **Positive:** one coherent ordering per issue across every view; the Board is
  unchanged (default scope); Backlog and future Sprint/board-type views reuse the
  exact rank + OCC machinery by adding a scope; no rank drift.
- **Negative / trade-offs accepted:** moving an issue in the Backlog *does* move
  it in the Board too (they share the rank) — this is intended and matches Jira;
  it is not two independent orders. Callers must send the correct `scope`
  (defaulted to `board` so existing clients are unaffected).
- **Follow-up actions:**
  1. `scope` on the reorder contract (default `board`); `findRankInBacklog`
     repository lookup; service branches validation by scope.
  2. Index `issues(projectId, sprintId, rank)` (migration).
  3. Backlog feature (list + reorder `scope=backlog`) reuses `PATCH /issues/{id}/rank`.
  4. Sprint (Phase 5) adds a `sprint` scope with zero change to Board/Backlog.
