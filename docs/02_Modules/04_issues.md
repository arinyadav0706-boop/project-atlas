# Module: Issues

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

The core entity: a unit of work with a type, status, priority, optional
assignee/sprint, and its own permalink key (e.g. `ENG-42`). Board, Backlog,
and Sprint are all views over `Issue`.

## Business Rules

- BR-1 (key generation): on create, the service increments
  `Project.issueKeyCounter` and assigns `key = "<Project.key>-<counter>"`
  inside the same transaction — never generated client-side, never reused
  even if an issue is later deleted (soft delete preserves the key).
- BR-2 (permissions): `VIEWER` project role can read but not create/edit
  issues; `MEMBER` and `LEAD` can create/edit; only `LEAD` (or the
  assignee/reporter) can delete.
- BR-3 (assignee constraint): `assigneeId`, if set, must be a
  `ProjectMember` of the same project — validated in the service layer
  (not just Zod, since it's a cross-entity check).
- BR-4 (epic/hierarchy constraint — single level, ADR-0026): `epicId`, if set,
  must reference an `Issue` with `type = EPIC` in the **same project**. Enforced
  server-side (cross-entity check, not just Zod), and mirrored in the UI:
  - An `EPIC` **cannot** have a parent (`epicId` must be null for epics) — no
    Epic-under-Epic nesting.
  - An issue cannot be its own parent (`epicId !== id`).
  - Cross-project parenting is rejected (the lookup is scoped to the project).
  - Cycles are impossible by construction: only non-epics can have a parent and
    epics cannot, so the depth is at most one.
- BR-4a (epic delete — detach, ADR-0026): deleting an `EPIC` (soft delete)
  **detaches its children** (`epicId → null`); children are preserved as
  independent issues. Never a cascade delete, never an orphaned pointer —
  consistent with component soft-delete (ADR-0018 BR-6).
- BR-4b (hierarchy display): the issue detail shows the **parent Epic** (for a
  child) and the **child issues** (for an Epic), both clickable; the create/edit
  forms expose a searchable Epic selector for non-epic types only.
- BR-5 (status transitions — the one fixed V1 workflow, PRD FR-3.2): only
  the transitions below are allowed; anything else returns `422`:

  | From | Allowed To |
  |---|---|
  | `TODO` | `IN_PROGRESS` |
  | `IN_PROGRESS` | `TODO`, `IN_REVIEW` |
  | `IN_REVIEW` | `IN_PROGRESS`, `DONE` |
  | `DONE` | `IN_REVIEW` (reopen for follow-up review), `TODO` (full reopen) |

  Skipping directly from `TODO` to `DONE` (or the reverse) is disallowed —
  it must pass through `IN_PROGRESS`, keeping the workflow meaningful for
  cycle-time reporting (`11_reports.md`).
- BR-6: every status transition is additionally written to `AuditLog`
  (`action: ISSUE_STATUS_CHANGED`) — this is the dual-purpose audit entry
  that powers the cycle-time report (`docs/03_Database/01_Database_Design.md §2.13`).
- BR-7 (ordering): `rank` is a string fractional key (LexoRank-style);
  inserting between two issues generates a new key strictly between their
  neighbours' keys (`generateKeyBetween`). There is **no precision ceiling and
  no rebalance job** — a key can always be generated between two keys. This is
  the ordering scheme ratified in **ADR-0009** (supersedes the float scheme of
  ADR-0007); new issues **append** to the end of their column
  (`generateKeyBetween(lastRank, null)`, not `Date.now()`).

## Database

`Issue`, `Label`, `IssueLabel` — `docs/03_Database/01_Database_Design.md §2.7-2.9`.

## API

`GET/POST /projects/{projectId}/issues`, `GET/PATCH/DELETE /issues/{issueId}`,
`POST /issues/{issueId}/transition`, `PATCH /issues/{issueId}/rank` —
`docs/04_API/openapi.yaml`.

## UI

Issue detail as a slide-over panel (screen #5 in
`docs/05_UI/02_Screens_and_Information_Architecture.md`) with an "expand to
full page" option for permalinks. Create-issue is a modal reachable from
Board, Backlog, and the project header. Status changes in the panel use
the same transition rules as drag-and-drop on the Board (single source of
truth: `POST /issues/{id}/transition`).

**The description is edited in place**, not only through the Edit dialog: an
empty one renders as an "Add a description" control, a filled one is
click-to-edit, ⌘↵ saves and Esc cancels. Version-checked like every other edit
(ADR-0011), so a description written over a stale read is refused rather than
overwriting someone else's. It was previously a static paragraph reading "No
description." whose only editor lived in a modal in the rail — it worked, but
nothing on the page said so, which made an editable field look like a dead end
(backlog UI-11).

## Acceptance Criteria

- Given a project with `issueKeyCounter = 5`, when a new issue is created,
  then it receives key `<key>-6` and the counter becomes `6`, atomically.
- Given an issue in `TODO`, when a transition to `DONE` is attempted
  directly, then the API returns `422` and the UI shows why (must go
  through In Progress / In Review).
- Given an assignee who is not a member of the issue's project, when an
  update tries to set them as assignee, then the request is rejected.
- Given two issues with adjacent `rank` keys, when a third issue is inserted
  between them, then a new key strictly between the two is generated and the
  row is written without any column rebalance.

## Validation

`CreateIssueInput`: `type` (enum, required), `title` (1–200 chars,
required), `description` (optional, sanitized on render, not on write —
raw Markdown source stored per `docs/03_Database/01_Database_Design.md §6`
open item), `priority` (enum, defaults `MEDIUM`), `storyPoints` (optional,
0–100 int). `UpdateIssueInput` mirrors the same field constraints,
all optional.

## Future Scope

- Subtasks (distinct from the Epic→Story/Task/Bug hierarchy).
- Custom fields per project/issue type.
- Configurable workflows (today: one fixed workflow, BR-5).
- Issue linking (`blocks` / `relates to` / `duplicates`).
