# Module: Search

**Status:** Accepted v2.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-23

## Overview

Global full-text search across projects and issues (PRD FR-6), backed by
PostgreSQL's built-in full-text search — no external search service in V1
(explicit non-goal, PRD §5). The query path sits behind a swappable
`SearchRepository` so a future move to an external engine
(Elastic/Typesense/Meilisearch) is a new repository implementation, not a
rewrite (**ADR-0021**).

## Business Rules

- BR-1: Search matches `Issue.title`, `Issue.description`, `Issue.key`, and
  `Project.name`, `Project.key`, ranked by Postgres `ts_rank` against the
  `GIN` expression indexes (`docs/03_Database/01_Database_Design.md §5`).
- BR-2: The query is a **prefix** match — each term is turned into a `:*`
  tsquery term — so results appear "as you type" (`log` matches `login`).
- BR-3: An issue whose **key** matches the raw query (e.g. `ENG-12`) is
  boosted above body matches: a user typing a key wants that exact issue.
- BR-4: Results are scoped to the caller's organization (F-1) and exclude
  soft-deleted rows (`deletedAt IS NULL`). Projects are org-visible
  (`03_projects.md` BR-7), so V1 needs no per-issue ACL join; a private-
  project ACL becomes a `WHERE` clause here if/when private projects land.
- BR-5: Query strings shorter than the minimum length (Validation) return an
  empty result set immediately, never a full unfiltered scan.
- BR-6: Each result group is capped (default 5 issues + 5 projects) so the
  palette stays fast and legible; deeper exploration is a future results
  page (Future Scope).

## Database

Reads `Issue`, `Project` via the `GIN` full-text expression indexes defined
in `docs/03_Database/01_Database_Design.md §5` and created by migration
`20260723130000_search_fts`. **No new tables, no denormalized search table**
(ADR-0021 — no data duplication). User input is sanitized to alphanumeric
terms and parameterized before the tsquery is built, so no tsquery-syntax
injection.

## API

`GET /api/search?q=` → `SearchResponse` — `docs/04_API/openapi.yaml`. Returns
two lean arrays (`issues`, `projects`) of result items carrying only what the
palette renders (id, key, title/name, href, projectKey). Any authenticated
org member may call it (VIEWER included); tenant scope still applies.

## UI

Screen #13 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a
global command-palette overlay (hand-rolled — no palette dependency, ADR-0021
§4) opened with **⌘K / Ctrl-K** or the search affordance in the top bar. It
debounces the query, groups results **Issues / Projects**, supports
arrow-key + Enter navigation, and opens the selected entity.

## Acceptance Criteria

- Given an issue titled "Fix login redirect bug," when a user searches
  "login redirect," then that issue appears in the results ranked above
  less-relevant matches.
- Given a user types a partial word ("logi"), then issues containing "login"
  still match (prefix search, BR-2).
- Given a query that is an exact issue key ("ENG-12"), then that issue is the
  top issue result (BR-3).
- Given a query of 1 character, when submitted, then the API returns an empty
  result set rather than querying the database (BR-5).
- Given a soft-deleted project matching the query text, when searched, then
  it never appears in results (BR-4).
- Given a project in another organization matching the query text, when
  searched, then it never appears in results (BR-4, F-1).

## Validation

`q`: required, trimmed, 1–100 chars accepted by the schema; a trimmed query
shorter than **2** characters short-circuits to an empty result (BR-5) rather
than erroring, so the palette can bind to every keystroke without throwing.

## Future Scope

Deferred (logged per rule #13 in ADR-0021 consequences + backlog):

- Weighted ranking / `ts_rank_cd`, trigram fuzzy matching (`pg_trgm`) for
  typos.
- Searching comment bodies, attachments, labels, and the org user directory.
- A full results **page** with filters + keyset pagination.
- Saved searches / filters.
- The external-engine `SearchRepository` adapter (Elastic/Typesense/etc.).
