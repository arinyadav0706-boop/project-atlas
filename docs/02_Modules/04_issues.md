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
- BR-4 (epic constraint): `epicId`, if set, must reference an `Issue` with
  `type = EPIC` in the same project; an `EPIC` cannot reference itself or
  another epic as its own parent.
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
- BR-7 (ordering): `boardOrder` is a float; inserting between two issues
  computes the midpoint; if the gap becomes too small (rebalancing
  threshold, e.g. difference `< 1e-6`), the service re-normalizes all
  `boardOrder` values for that column/backlog in one transaction. This is the
  ordering scheme ratified in **ADR-0007**; new issues **append** to the end of
  their column (not `Date.now()`).

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

## Acceptance Criteria

- Given a project with `issueKeyCounter = 5`, when a new issue is created,
  then it receives key `<key>-6` and the counter becomes `6`, atomically.
- Given an issue in `TODO`, when a transition to `DONE` is attempted
  directly, then the API returns `422` and the UI shows why (must go
  through In Progress / In Review).
- Given an assignee who is not a member of the issue's project, when an
  update tries to set them as assignee, then the request is rejected.
- Given two issues with `boardOrder` 1.0 and 1.0000001, when a third issue
  is inserted between them, then the column is rebalanced in one
  transaction rather than producing an unusable float gap.

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
