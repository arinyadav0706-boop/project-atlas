# Module 18 — Components

> Named sub-systems of a single project, optionally routing new work to a
> default owner. Governance and data model: **ADR-0018**.

## Overview

A **Component** is a project-scoped entity (`name`, optional `description`,
optional `leadId`) representing a part of that project — `Payments API`,
`Mobile App`, `Infra`. Many components per issue (`IssueComponent` join). When
a component with a `leadId` is added to an issue that has **no assignee**, the
issue is auto-assigned to that lead (Jira-style routing) — we never override an
existing assignee.

## Business Rules

- **BR-1 (CRUD)**: create / rename / edit / soft-delete a component requires
  the **project LEAD** of that project (component config is project config;
  org ADMIN has no implicit project power — `15_roles.md`).
- **BR-2 (apply)**: any project MEMBER/LEAD may add/remove a component on an
  issue in that project (VIEWER cannot).
- **BR-3 (default assignee)**: adding a component that has a `leadId` to an
  issue whose `assigneeId` is null sets the assignee to that lead. An existing
  assignee is never overwritten. Removing a component never unassigns.
- **BR-4 (uniqueness)**: component names are unique per project,
  case-insensitive, over live rows.
- **BR-5 (validation)**: `name` 1–50 chars after trim; `description` ≤ 500;
  `leadId`, if set, must be a member of the project. Zod, shared client/server.
- **BR-6 (tenant scope, F-1)**: all reads/writes scoped via the owning
  project's org; cross-org access is NotFound.
- **BR-7 (soft delete + audit)**: `deletedAt` on delete; component drops from
  pickers/chips/filters, `IssueComponent` history retained. CRUD audited.

## Data

New `components`: `id`, `projectId`, `name`, `description?`, `leadId?`, audit,
`deletedAt`, case-insensitive unique `(projectId, name)` over live rows. New
`issue_components` join: `(issueId, componentId)`. Migration
`20260723..._labels_components`.

## API

- `GET /api/projects/{projectId}/components` — live components for the project.
- `POST /api/projects/{projectId}/components` — create (BR-1).
- `PATCH /api/components/{id}` — rename/edit/reassign lead (BR-1).
- `DELETE /api/components/{id}` — soft delete (BR-1).
- `PUT /api/issues/{issueId}/components` — set the issue's components to
  `{ componentIds }` (MEMBER/LEAD; applies BR-3 for newly added ones).

## UI

- **Component picker** on the issue detail (removable chips + add combobox).
- **Chips** on issue detail, list rows, board cards, backlog rows.
- **Filter** control in Board/Backlog (adds `BoardFilter.componentIds`).
- **Management** in Project Settings → Components (BR-1), with a lead selector.

## Acceptance Criteria

- A LEAD creates `Payments API` with lead = Aditi; adding it to an unassigned
  issue assigns Aditi; adding it to an already-assigned issue does not change
  the assignee.
- A MEMBER can apply/remove components but cannot create/edit/delete them.
- A component name duplicate (case-insensitive) within a project is rejected.
- Filtering the board by a component shows only issues carrying it.

## Future Scope (deferred — ADR-0018, backlog)

Component-based board swimlanes, component lead as a watcher (Notifications),
per-component default issue type, component archiving vs delete, cross-project
component templates.
