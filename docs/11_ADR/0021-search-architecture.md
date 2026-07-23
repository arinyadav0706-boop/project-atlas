# ADR-0021 — Search: Postgres Full-Text via a Swappable Repository

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

Global search across projects and issues (PRD FR-6, 12_search.md). It must be
scalable and Jira-parity-ready, but V1 explicitly avoids an external search
service (PRD §5). It must also stay portable (ADR-0004 — no vendor lock-in) and
modular, so a future move to an external engine (Elastic/Typesense/Meilisearch)
is contained.

## Decision

### 1. PostgreSQL full-text search (tsvector + GIN), no external service

Search is served by Postgres FTS over existing tables — **no new tables, no
duplication**:

- **Expression GIN indexes** (raw-SQL migration, Prisma can't express them):
  - `issues`: `GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')))`
  - `projects`: `GIN (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(key,'')))`
- **Query** matches the same expression with a **prefix tsquery** built from the
  user's terms (each term gets `:*`), so it works "as you type"; results are
  ranked by `ts_rank`.
- **Issue key** matches (`ENG-12`) are handled by a direct `ILIKE` on `key`,
  boosted above body matches — a palette user typing a key wants that issue.
- User input is sanitized to alphanumerics before building the tsquery
  (parameterized), so no tsquery-syntax injection.

### 2. A swappable `SearchRepository` — the modularity seam

All query logic lives behind `SearchRepository.searchIssues/searchProjects`.
The service and UI depend only on the `SearchResult` DTO. Moving to an external
engine later is a **new repository implementation** behind the same interface —
no service/UI/API change. This is the extensibility line for Jira-scale search.

### 3. RBAC is org-scope, not a per-user ACL (V1)

Projects are org-visible (03_projects.md BR-7): every employee can see every
non-deleted project and its issues. So search filters by
`project.organizationId = actor.organizationId` and `deletedAt IS NULL` (F-1),
not a per-issue ACL join. A private-project ACL becomes a `WHERE` clause here
if/when private projects land.

### 4. Command-palette UI

A global ⌘K / Ctrl-K overlay (hand-rolled — no palette dependency) with
debounced query, results grouped Issues / Projects, keyboard navigation, and
Enter-to-open. A search affordance in the top bar opens the same palette.

## Consequences

- Fast, ranked, typo-adjacent-enough search at V1 scale with zero new infra.
- Deferred (logged, rule #13): weighted/`ts_rank_cd` tuning, trigram fuzzy
  matching for typos (`pg_trgm`), searching comments/attachments/labels, a
  full results *page* with filters + pagination, saved searches, and the
  external-engine adapter. All are additive behind the repository seam.
- The FTS indexes must be applied to prod (GL-4 family) — the expression form
  is safe/additive.
