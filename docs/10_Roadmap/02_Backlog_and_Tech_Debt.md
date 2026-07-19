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
| GL-4 | **Apply DB migrations to production Supabase** (incl. `perf_indexes`) | P1 | OPEN | Prod schema was created manually → no migration history. Baseline via `prisma migrate resolve --applied`, then `migrate deploy`. Indexes are **not live in prod** yet. |
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
| PERF-11 | Dashboard: streamed `<Suspense>` widgets, capped + parallel | P2 | No | OPEN | Lock in when the Dashboard module is built. |
| PERF-12 | Read replicas for read-heavy endpoints | P4 | No | OPEN | Large scale. |

## Database & infrastructure

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| DB-1 | Covering indexes (issue list, my-issues, activity) | P2 | — | ✅ DONE (in code) | Migration `20260715000000_perf_indexes`; **apply to prod = GL-4**. |
| DB-2 | Real migration workflow (CI `migrate deploy` + baseline) | P2 | No | OPEN | Prod was hand-created; formalize. |
| DB-3 | Partial index `WHERE deletedAt IS NULL` on issues | P3 | No | OPEN | Not expressible in Prisma schema; raw SQL migration. |
| DB-4 | `CREATE INDEX CONCURRENTLY` at scale | P4 | No | OPEN | Ops runbook for large tables. |
| DB-5 | `audit_logs` / `notifications` retention & partitioning | P4 | No | OPEN | Unbounded-growth tables. |

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

## UX / UI

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| UX-1 | **Premium UI re-skin** of the whole app | P2 | No | PLANNED | Deliberately "basic UI until MVP complete", then premium pass (founder manifesto). Sign-in already premium (the one exception). Decoupled from data → no migration needed. |
| UX-2 | `boardOrder` → LexoRank-style fractional ranking | P2 | No | OPEN | Needed for Board drag-reorder. **ADR-0007 candidate.** |
| UX-3 | Consistent empty / loading / error states pass | P3 | No | OPEN | |

## Groundwork for future modules

| ID | Item | Pri | 🚩 | Status | Notes |
|---|---|---|---|---|---|
| FUT-1 | Search: full-text strategy (`tsvector`/`pg_trgm` vs engine) | P3 | No | OPEN | Decide before the Search module. |
| FUT-2 | Attachments: implement a `StorageAdapter` (S3/Supabase/Azure/local) | P3 | No | OPEN | When Attachments is built (ADR-0004). |

## Remaining V1 modules
Tracked in `01_Development_Roadmap.md §2` — next: **Board**, then Backlog & Sprint,
Comments, Attachments, Notifications, Dashboard (full), Reports, Search, Admin /
User Management / Roles / Profile. Not duplicated here to avoid drift.
