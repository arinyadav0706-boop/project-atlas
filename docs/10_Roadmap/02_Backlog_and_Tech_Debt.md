# 02 — Backlog & Tech-Debt Ledger

**The single source of truth for everything we consciously deferred.** The
Roadmap (`01_Development_Roadmap.md`) tracks *modules and phases*; this tracks
the cross-cutting items — performance polish, security, infra, testing gaps, UX,
and product decisions — that would otherwise get lost between modules.

## Discipline (non-negotiable)
- **Every time we say "later", it gets an entry here** — same commit, ideally.
- Nothing ships to production (Internal GA, Phase 8) with an open **🚩 Go-live**
  item. That column is the launch gate.
- When an item is done, mark it `DONE` with the date (don't delete — the history
  is the record). Detailed rationale lives in the linked source doc; this is the
  index.

**Priority:** P1 critical · P2 high · P3 medium · P4 scale-later.
**🚩 Go-live** = must be resolved before real users (Phase 8).

---

## 🚩 Go-live blockers (the launch checklist)

| ID | Item | Pri | Status | Notes |
|---|---|---|---|---|
| GL-1 | **Remove or rotate the seeded known-password accounts** (`arin…` + 5 teammates) | P1 | OPEN | Known passwords in prod (`prisma/seed.ts`). Must be gone/rotated before real users. |
| GL-2 | **Security review** of the whole surface (Phase 7) | P1 | OPEN | Roadmap Phase 7. Run `/security-review` + manual pass. |
| GL-3 | **Rate limiting** on auth + mutation endpoints | P2 | OPEN | No limiter today; brute-force/abuse exposure. |
| GL-4 | **Apply DB migrations to production Supabase** (incl. `perf_indexes`, `board_rank`, `rank_collation`, `rank_unique`, `issue_version`, `home_personalization`, `backlog_index`) | P1 | 🚩 | OPEN | Prod schema was created manually → no migration history. Baseline via `prisma migrate resolve --applied`, then `migrate deploy`. Indexes are **not live in prod** yet. `20260719000000_board_rank` backfills `rank` in SQL for ≤62 issues per (project,status) column and **fails loudly** above that — if a prod column is larger, backfill via `generateNKeysBetween` first. `20260720000000_rank_collation` pins `rank` to `COLLATE "C"`. `20260720100000_rank_unique` adds the unique `(projectId,status,rank)` index — **check for pre-existing duplicates first** (query in the migration). **Interim:** `board_rank` + `rank_collation` were applied to prod as standalone hotfix SQL on 2026-07-20 (see incident, DB-2); the baseline must reconcile migration history with that manual state (and the unique index still needs applying). |
| GL-5 | **Confirm `DATABASE_URL` = `?pgbouncer=true&connection_limit=1`** | P2 | PARTIAL | `pgbouncer=true` confirmed; add `&connection_limit=1`. |
| GL-6 | **SSO credentials** (Google + Microsoft OAuth apps) if launching with SSO | P2 | OPEN | Config, not code. Credentials login works today. |
| GL-7 | **Load test to ~60 concurrent** (Phase 7 NFR) | P2 | OPEN | Validate the scale targets in `05_Performance_and_Scalability.md`. |

---

## Performance & scalability (source: `docs/01_Architecture/05_Performance_and_Scalability.md`, `docs/08_Testing/02_Performance_Investigation.md`)

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| PERF-1 | Region mismatch (Vercel↔Supabase) | P1 | — | ✅ DONE 2026-07-19 | Vercel → Mumbai; reads dropped to ~1–2 s. |
| PERF-2 | Create: remove full-page `router.refresh()` → in-place insert | P2 | — | ✅ DONE 2026-07-19 | Create ~8 s → ~200 ms. |
| PERF-3 | Same in-place pattern for **edit / transition / delete** | P2 | No | OPEN | These still full-refresh; make them instant like create. |
| PERF-4 | Login: 3× `findByEmail` → 1× | P3 | No | OPEN | Redundant lookups (`auth-config.ts`). |
| PERF-5 | Parallelize `resolve()` (getContext ‖ getMemberRole) | P3 | No | OPEN | Two serial queries → one parallel step. |
| PERF-6 | Drop extra relation SELECTs in `createWithKey` | P3 | No | OPEN | Fetch assignee/reporter only when needed. |
| PERF-7 | Cold start (Vercel Free/Hobby + Prisma init ~1.5–2 s) | P2 | No | OPEN | First action after idle. Fix = paid tier / keep-warm. |
| PERF-8 | Virtualize long lists (`@tanstack/react-virtual`) | P3 | No | OPEN | When page sizes climb. |
| PERF-9 | Structured logging + observability | P2 | No | OPEN | Only `console.error` today. |
| PERF-10 | Move audit-log writes off the request hot path (queue) | P3 | No | OPEN | At volume. |
| PERF-11 | Home: streamed `<Suspense>` widgets, capped + parallel | P2 | — | ✅ DONE | Home module — each section its own streamed Suspense, bounded, one membership query per request (ADR-0012). |
| PERF-12 | Read replicas for read-heavy endpoints | P4 | No | OPEN | Large scale. |
| PERF-13 | Move `RecentItem` upserts off the request hot path (queue) | P3 | No | OPEN | Home engagement signal is recorded synchronously (best-effort, guarded) on issue view/edit; queue it at volume — same treatment as audit (PERF-10). |

## Database & infrastructure

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| DB-1 | Covering indexes (issue list, my-issues, activity) | P2 | — | ✅ DONE (in code) | Migration `20260715000000_perf_indexes`; **apply to prod = GL-4**. |
| DB-2 | Real migration workflow (`migrate deploy` on deploy + baseline) | P1 | 🚩 | PARTIAL | **Root cause of the 2026-07-20 prod outage:** deploy ran only `next build`, so merging the Board shipped code that queried `rank` while prod still had `boardOrder` → Issues/Board 500'd. **Mechanism DONE (in code):** `vercel-build` script now runs `prisma migrate deploy` before build; runbook in `docs/06_Infrastructure/03_Migrations_and_Deploy.md`. **Still open (needs prod access):** the one-time prod baseline (inspect → apply-missing → `migrate resolve --applied` all migrations). `vercel-build` must NOT reach a deploying branch until that baseline is done, or new builds fail (running app stays up). Closes GL-4 when complete. |
| DB-6 | `rank` column pinned to `COLLATE "C"` (byte order) | P1 | — | ✅ DONE (in code) | Migration `20260720000000_rank_collation` + collation integration guard. LexoRank keys only sort correctly under byte order (ADR-0009); a locale collation silently breaks board order. **Apply to prod = part of GL-4** (or the standalone hotfix SQL already run). |
| DB-3 | Partial index `WHERE deletedAt IS NULL` on issues | P3 | No | OPEN | Not expressible in Prisma schema; raw SQL migration. |
| DB-4 | `CREATE INDEX CONCURRENTLY` at scale | P4 | No | OPEN | Ops runbook for large tables. |
| DB-5 | `audit_logs` / `notifications` retention & partitioning | P4 | No | OPEN | Unbounded-growth tables. |
| DB-8 | Reorder/edit concurrency hardening | P3 | No | PARTIAL | **Collision-free keys DONE (ADR-0010).** **Same-card lost-update DONE for reorder, edit, and transition (ADR-0011):** `version` column + conditional writes (`reorderWithVersion`/`updateWithVersion`/`setStatusWithVersion`); a stale change gets a `409` instead of silently overwriting; unit + integration + route tests; clients (board drag, edit dialog, status control) send and refresh the version. **Still open:** (a) OCC on **delete** (currently increments version but isn't version-checked — deleting is terminal, lowest value); (b) on-demand re-rank **repair tool** for any fractional-key clusters from a prior collision. |
| DB-7 | Multi-engine SQL support (MySQL/SQL Server/Oracle) | P4 | No | PARKED (V2/V3) | **Not a current goal** — EAGLES is PostgreSQL-only by design (ADR-0002/0004). Accommodatable in this repo (repository pattern shields app code), not a rewrite, but a scoped initiative: rewrite raw-SQL migrations per engine, replace Postgres-only features (enums, FTS, `pg_trgm`, RLS, `COLLATE "C"`), add a per-engine CI matrix. Requires its own ADR + cost estimate first. Surface catalogued in `docs/01_Architecture/06_Portability_Boundary.md`. |

## Security & tenancy (source: `docs/07_Security/`, `docs/08_Testing/01_Testing_Strategy.md`)

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| SEC-1 | F-1: scope all reads/writes to caller's org | P1 | — | ✅ DONE 2026-07-19 | Cross-org access now fails closed (NotFound). |
| SEC-2 | Postgres Row-Level Security as tenant backstop | P3 | No | OPEN | Defense-in-depth; recommended before multi-tenant SaaS (V2). |
| SEC-3 | (see GL-1, GL-2, GL-3) | — | 🚩 | OPEN | Tracked in the go-live table. |

## RBAC / product decisions (tracked, deferred by decision)

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| RBAC-1 | Org ADMIN as project admin | — | No | DECIDED (keep as-is) | Founder decision 2026-07-12: admins hold no implicit project powers (`15_roles.md`). Revisit path documented if the company wants it later. |
| RBAC-2 | Lone-lead handoff gap | P3 | No | OPEN | A single-lead project can't transfer leadership without first adding a 2nd lead. Tied to RBAC-1. |

## Testing gaps (source: `docs/08_Testing/01_Testing_Strategy.md`)

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| TEST-1 | E2E: full workflow walk (TODO→…→DONE) + "Load more" >50 | P3 | No | OPEN | |
| TEST-2 | Concurrency-on-edit test (two users transition same issue) | P3 | No | OPEN | |
| TEST-3 | Keep the RBAC matrix complete as each new module lands | P2 | No | ONGOING | Per-module acceptance criterion (`15_roles.md`). |
| TEST-4 | Board **E2E** (Playwright): drag reorder persists across reload; cross-column move runs the workflow; VIEWER drag disabled | P3 | No | OPEN | Reorder data path is covered by `board.integration.test.ts` + `board.service.test.ts` + the `rank` route test; the dnd-kit UI wiring (neighbour computation on drop) has no browser test yet. |
| TEST-5 | Backlog **E2E** (Playwright): drag reorder persists across reload; VIEWER drag disabled; "Load more" pages | P3 | No | OPEN | Data path covered by `backlog.integration.test.ts` + `backlog.service.test.ts` + the shared `rank` route test (scope=backlog); the dnd-kit single-list UI wiring has no browser test yet (same gap as TEST-4). |
| TEST-6 | Sprint **E2E** (Playwright): drag Backlog↔Sprint assigns/clears sprintId; Start/Complete flow; VIEWER read-only | P3 | No | PARTIAL | `e2e/sprint-drag.spec.ts` drives a real browser: create sprint → drag a backlog **card body** into the sprint → progress reflects it. This caught the DND-1 bug (whole card wasn't draggable). Still to add: Start/Complete flow + VIEWER read-only in the browser. |
| DND-1 | Whole card must be the drag handle; kill native anchor drag | P2 | — | ✅ FIXED 2026-07-21 | Backlog/sprint rows only made the tiny grip draggable, and the title `<a>` triggered the browser's **native link-drag** (a URL ghost) that hijacked the gesture — users "couldn't drag" issues into a sprint. Fix: whole row is the drag handle + `draggable={false}` on the title link (backlog-item + board-card). Regression-guarded by `e2e/sprint-drag.spec.ts`. Root lesson: green unit/integration + a handle-targeted e2e passed while the real user gesture failed — **drive the actual gesture in a browser**. |

## UX / UI

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| UX-1 | **Premium UI re-skin** of the whole app | P2 | No | PLANNED | Deliberately "basic UI until MVP complete", then premium pass (founder manifesto). Sign-in already premium (the one exception). Decoupled from data → no migration needed. |
| UX-2 | Board ordering scheme | P2 | No | DECIDED (ADR-0009) | String fractional ranking (LexoRank-style, `rank` column via `fractional-indexing`) — adopted now while data volume is near-zero. Board build: migration `boardOrder`→`rank` + backfill, `createWithKey` append, `generateKeyBetween` on reorder. Supersedes the float decision (ADR-0007). |
| UX-4 | ~~Per-column **rebalance** utility for `boardOrder`~~ | — | No | RETIRED | Not needed: string fractional ranking has no precision ceiling (ADR-0009 supersedes ADR-0007). |
| UX-5 | Board per-column "load more" (very large columns) | P3 | No | OPEN | Columns are capped at `BOARD_COLUMN_LIMIT`=100 in V1 (ADR-0008 / Perf doc). At the cap the lowest-ranked tail is omitted; add per-column keyset "load more". |
| UX-6 | Board **live cross-column drag preview** (dnd-kit `onDragOver`) | P3 | No | OPEN | V1 re-lays columns optimistically on **drop** (`onDragEnd`) only — the drag itself doesn't show the card crossing columns live. Fine for "basic UI"; polish with the premium pass (UX-1). |
| FUT-3 | Board **Saved Filters** (stored named `BoardFilter`) | P3 | No | OPEN | Reuses the ADR-0008 filter contract; future table. |
| FUT-4 | Board filters not yet activated: **Sprint, Epic, Label** | P3 | No | OPEN | The `BoardFilter` contract + server `where` already accept them (ADR-0008); V1 filter bar exposes only assignee/type/priority (data that exists). Add controls as those modules ship — no board redesign. |
| UX-3 | Consistent empty / loading / error states pass | P3 | No | OPEN | |

## Groundwork for future modules

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| FUT-1 | Search: full-text strategy (`tsvector`/`pg_trgm` vs engine) | P3 | No | OPEN | Decide before the Search module. |
| FUT-2 | Attachments: implement a `StorageAdapter` (S3/Supabase/Azure/local) | P3 | No | OPEN | When Attachments is built (ADR-0004). |
| FUT-5 | Sprint: **follow-up-sprint target at completion** (`moveIncompleteIssuesToSprintId`) | P3 | No | OPEN | MVP `complete` always returns incomplete issues to the backlog (ADR-0014). Add a "move to next sprint" option at completion when multi-sprint planning lands (FUT-6). |
| FUT-6 | Sprint: **multi-sprint planning** (several `PLANNED` sprints at once) | P3 | No | OPEN | MVP shows one current sprint (ACTIVE, else next PLANNED) on the Backlog page (ADR-0014). Backlog↔Sprint drag + one-active rule already generalise; the UI would grow a sprint picker/multiple sections. |
| FUT-7 | Sprint: **velocity / burndown reports** | P3 | No | OPEN | The `COMPLETED` sprint's issue set is the immutable record (BR-5); story-point totals already computed in progress. Consumed by the Reports module (`11_reports.md`). |
| TD-1 | Consolidate the 5 issue-list-item mappers into one shared fn | P4 | No | OPEN | `issue.service.toListDto`, `board.service.toCardDto`, `home.service.toCard`, `backlog.service.toCardDto`, `sprint.service.toCardDto` are near-identical `IssueListItemDto` mappers; extract one `toIssueListItemDto` when convenient (kept per-feature for now, consistent with existing pattern). |

## Remaining V1 modules
Tracked in `01_Development_Roadmap.md §2`. Core (Phase 4) complete: Auth, Projects,
Issues, Board, **Home**. Phase 5: **Backlog** ✅ + **Sprint** ✅ (MVP) done. Next:
Comments, Attachments; then Notifications, Reports, Search, Admin / User Management /
Roles / Profile. Not duplicated here to avoid drift.

**Sprint adds no schema change or migration** — it reuses the existing `Sprint`
table, `Issue.sprintId`/`rank`/`version`, and the `issues(projectId, sprintId, rank)`
index (ADR-0014). Prod just needs the `sprints` table to exist (part of the manual
baseline reconciliation, GL-4/DB-2).
