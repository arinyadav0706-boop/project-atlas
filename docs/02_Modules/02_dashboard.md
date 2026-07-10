# Module: Dashboard

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

The personal landing page after sign-in: what's assigned to me, what
recently happened on projects I'm part of, and quick access to my
projects. Read-only aggregation over existing entities — no new data
model.

## Business Rules

- BR-1: "Assigned issues" = non-deleted `Issue` rows where
  `assigneeId = currentUser.id`, across all projects the user is a member
  of, sorted by `dueDate` (nulls last) then `priority`.
- BR-2: "Recent activity" reads `AuditLog` entries scoped to projects the
  user is a member of (never entries from projects they can't see),
  newest first, capped to the last 20.
- BR-3: "Project shortcuts" = `Project` rows the user has a `ProjectMember`
  row for, `status = ACTIVE` only (archived projects don't clutter the
  dashboard).
- BR-4: A user who is not yet a member of any project sees an empty state
  directing them to browse/join a project, not a blank dashboard.

## Database

Reads `Issue`, `AuditLog`, `Project`, `ProjectMember` — no new tables. See
`docs/03_Database/01_Database_Design.md`.

## API

`GET /dashboard` → `DashboardResponse` (`docs/04_API/openapi.yaml`).

## UI

Screen #2 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: three
sections on one page — assigned issues (list, click opens the issue detail
panel per the shared interaction pattern), recent activity (compact feed),
project shortcuts (card grid). Light theme, no heavy chrome — this is the
first screen after login and sets the tone (Design Principles §1).

## Acceptance Criteria

- Given a user with 3 assigned open issues across 2 projects, when they
  load the dashboard, then all 3 appear sorted by due date then priority.
- Given a user who belongs to no projects, when they load the dashboard,
  then they see the "join or create a project" empty state, not an error.
- Given a project the user is not a member of, when activity happens on
  it, then that activity never appears in the user's recent activity feed.

## Validation

None beyond authentication — this module is read-only with no user input
besides implicit auth context.

## Future Scope

- Customizable/reorderable dashboard widgets.
- Cross-project burndown/velocity summary.
- Saved personal filters ("my issues due this week").
