# Module: Projects

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

A `Project` is the top-level container for issues, sprints, and
membership. Every other module operates inside a project's scope.

## Business Rules

- BR-1: Creating a project requires a unique `key` (per organization) and
  a `name`; the creator is automatically added as a `ProjectMember` with
  `role = LEAD`.
- BR-2: `key` is immutable after creation — issue keys (`<key>-<n>`) are
  generated from it, and changing it after issues exist would break
  existing issue keys/links.
- BR-3: A project must always have at least one `LEAD`. The service layer
  rejects removing or demoting the last remaining `LEAD` (enforced
  transactionally, not just a UI guard — see `PATCH/DELETE
  /projects/{id}/members/{memberId}` in the API spec).
- BR-4: Setting `status = ARCHIVED` makes the project read-only: no new
  issues, sprints, or membership changes; existing data remains visible.
- BR-5: Deleting a project is a soft delete (`deletedAt` set); issues and
  history are retained for audit/compliance (BRD BR-5) and excluded from
  active views/search.
- BR-6: Only org employees can be added as project members in V1 — no
  external/guest collaborators (Vision §8 A4).
- BR-7: By default, all authenticated employees can view all `ACTIVE`
  projects (internal-tool default, Vision §8 A4); membership governs
  *edit* rights, not *visibility*, in V1.

## Database

`Project`, `ProjectMember` — `docs/03_Database/01_Database_Design.md §2.4-2.5`.

## API

`GET/POST /projects`, `GET/PATCH/DELETE /projects/{projectId}`,
`GET/POST /projects/{projectId}/members`,
`PATCH/DELETE /projects/{projectId}/members/{memberId}` — `docs/04_API/openapi.yaml`.

## UI

Screens #3 (Project list) and #4 (Project settings) in
`docs/05_UI/02_Screens_and_Information_Architecture.md`. Settings screen
has tabs: General (name/description/status), Members (role table + invite
existing org user), Danger Zone (archive/delete, behind a confirmation —
still using the toast+Undo pattern for delete where feasible, per Design
Principles §5).

## Acceptance Criteria

- Given a user creates a project with key `ENG`, when the project is
  created, then the creator has `ProjectMember.role = LEAD` and the
  project's `issueKeyCounter` starts at `0`.
- Given a project has exactly one `LEAD`, when someone attempts to remove
  or demote that member, then the request is rejected with `409` (per the
  API spec) and a clear UI message.
- Given a project is `ARCHIVED`, when a member attempts to create an
  issue in it, then the request is rejected.
- Given a project is soft-deleted, when any user lists projects or
  searches, then it never appears.

## Validation

`CreateProjectInput`: `key` — 2–10 chars, uppercase letters/digits,
starting with a letter (`^[A-Z][A-Z0-9]{1,9}$`); `name` — 1–100 chars,
required. `UpdateProjectInput`: `name`/`description` optional,
`status` enum. Same Zod schema drives both the create form and the
server-side check (Coding Standards §3).

## Future Scope

- Project templates (pre-populated labels/workflow for common project
  types).
- Restricting project *visibility* (not just edit rights) to specific
  members — currently a V1 non-goal (Vision §8 A4).
- Configurable per-project workflows (currently one fixed workflow,
  PRD non-goals).
- Archival retention policy automation.
