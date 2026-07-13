# Module: Search

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

Global full-text search across projects and issues (PRD FR-6), backed by
PostgreSQL's built-in full-text search — no external search service in V1
(explicit non-goal, PRD §5).

## Business Rules

- BR-1: Search matches `Issue.title`, `Issue.description`, `Issue.key`,
  and `Project.name`, `Project.key`, ranked by Postgres `ts_rank` against a
  `GIN` index (`docs/03_Database/01_Database_Design.md §5`).
- BR-2: Results are filtered to entities the requesting user is authorized
  to see — in V1 that's simply non-deleted, `ACTIVE`-or-visible projects
  (per `03_projects.md` BR-7, all employees can view all active projects),
  so the filter is mainly "not soft-deleted," not a per-user ACL join.
- BR-3: Query strings shorter than the minimum length (Validation) return
  an empty result set immediately, not a full unfiltered scan.

## Database

Reads `Issue`, `Project` via the `GIN` full-text indexes defined in
`docs/03_Database/01_Database_Design.md §5`. No new tables.

## API

`GET /search?q=` → `SearchResponse` — `docs/04_API/openapi.yaml`.

## UI

Screen #13 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a
command-palette-style overlay (shadcn/ui `command` component, keyboard
shortcut to open), grouped results (Projects / Issues), each result
showing enough context (project key, issue key, title snippet) to
recognize the match without opening it.

## Acceptance Criteria

- Given an issue titled "Fix login redirect bug," when a user searches
  "login redirect," then that issue appears in the results ranked above
  less-relevant matches.
- Given a query of 1 character, when submitted, then the API returns an
  empty result set rather than querying the database.
- Given a soft-deleted project matching the query text, when searched,
  then it never appears in results.

## Validation

`q`: required, 2–100 chars (trimmed) — shorter/longer requests are
rejected with a validation error, not silently truncated.

## Future Scope

- Searching comment bodies.
- Saved searches / filters.
- Fuzzy/typo-tolerant matching.
- Searching users (currently out of scope — org directory isn't part of
  V1 search).
