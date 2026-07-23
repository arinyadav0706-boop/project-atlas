# Module 17 — Labels

> Cross-cutting, org-wide tags applied to issues for grouping and filtering.
> Governance model and rationale: **ADR-0018**. Labels extend the Issues
> module conceptually but are documented and built as their own vertical slice
> (own repository/service/API/UI) for clarity and reuse.

## Overview

A **Label** is an org-scoped entity (`name`, `color`) that any member can
create and apply to issues. Many labels per issue (`IssueLabel` join). Labels
are the same across every project, so `frontend` means one thing org-wide and a
filter for it is reliable — the property free-text tags can't guarantee.

## Business Rules

- **BR-1 (create + apply)**: any org member may create a label and apply an
  existing label to an issue. *Applying* additionally requires MEMBER/LEAD on
  the issue's project (a VIEWER cannot change issues). Creation is deliberately
  frictionless (ADR-0018 §2).
- **BR-2 (manage)**: rename / recolor / soft-delete a label requires org
  **ADMIN** or **LEAD of at least one project**. Mutating a shared label
  changes it everywhere, so it is the guarded operation.
- **BR-3 (uniqueness)**: label names are unique per organization,
  **case-insensitive** (`Bug` == `bug`), enforced by a functional unique index
  over live rows. Reusing the name of a soft-deleted label is allowed.
- **BR-4 (validation)**: `name` 1–50 chars after trim; `color` a `#RRGGBB` hex.
  Validated server-side regardless of the client (Zod, one schema shared).
- **BR-5 (tenant scope, F-1)**: every read/write is scoped to the actor's
  organization; a label from another org is treated as absent (NotFound).
- **BR-6 (soft delete)**: deleting a label sets `deletedAt`; it drops out of
  lists, pickers, chips, and filters. `IssueLabel` rows are left intact as
  history (a future merge/cleanup tool reconciles — ADR-0018).
- **BR-7 (audit)**: create/rename/recolor/delete are recorded via
  `AuditLogService`.

## Data

`labels` (existing): `id`, `organizationId`, `name`, `color`, audit,
`deletedAt`. `issue_labels` (existing join): `(issueId, labelId)`.
Migration `20260723..._labels_components` swaps the case-sensitive
`@@unique([organizationId, name])` for a case-insensitive functional unique
index over live rows.

## API

- `GET /api/labels` — all live labels for the org (for pickers + filters).
- `POST /api/labels` — create `{ name, color }` (BR-1).
- `PATCH /api/labels/{id}` — rename/recolor (BR-2).
- `DELETE /api/labels/{id}` — soft delete (BR-2).
- `PUT /api/issues/{issueId}/labels` — set the issue's labels to `{ labelIds }`
  (idempotent replace; MEMBER/LEAD). Chosen over per-label add/remove so the
  editor saves the whole set atomically.

## UI

- **Label picker** on the issue detail: current labels as removable chips + an
  "add label" combobox with autocomplete (steers toward existing labels) and
  inline create.
- **Chips** on issue detail, issue-list rows, board cards, backlog rows.
- **Filter** control (multi-select) in the Board and Backlog filter bars — the
  query side is already plumbed (`BoardFilter.labelIds`).
- **Management** (rename/recolor/delete) in Project Settings → Labels, gated by
  BR-2. (Moves to Admin when that module lands.)

## Acceptance Criteria

- A member creates `payments`; it appears in the picker and can be applied.
- Creating `Payments` when `payments` exists is rejected (BR-3) and the picker
  offers the existing one.
- A VIEWER sees chips/filters but no add/remove or management controls.
- A non-LEAD member cannot rename or delete a label (403).
- Filtering the board by a label shows only issues carrying it.

## Future Scope (deferred — ADR-0018, backlog)

Creation-lockdown toggle (Phase 2), label merge, usage counts, label
groups/scoping, per-project label sets, label analytics in Reports.
