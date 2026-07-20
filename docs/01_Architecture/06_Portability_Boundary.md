# 06 — Portability Boundary

## What "portable" means for EAGLES (and what it does not)

EAGLES targets **PostgreSQL, on any Postgres host** — Supabase, Azure Database
for PostgreSQL, AWS RDS for PostgreSQL, or a self-hosted Postgres container.
Portability is achieved by never coupling to a *host's* proprietary SDK
(ADR-0004): the app speaks the standard Postgres wire protocol via Prisma, and
file storage goes through the `StorageAdapter` interface.

**Portable does NOT mean "any SQL engine."** EAGLES does not support MySQL,
MariaDB, SQL Server, or Oracle. The database decision (ADR-0002) chose
PostgreSQL specifically over NoSQL *and* over generic multi-engine SQL, because
the domain is relational and Postgres's feature set (below) is worth depending
on. The self-hosted distribution ships as a **sealed container image**
(ADR-0006), so we control the Postgres version a client runs — we never inherit
an arbitrary engine.

## The Postgres-specific surface (the checklist a future port would face)

If multi-engine SQL ever becomes a real product goal, it is an accommodation in
this same repo — **not a rewrite** — because the repository pattern isolates all
database access to `*.repository.ts`. The application/service/UI layers barely
change. The work concentrates here:

| Dependency | Where | Portable as-is? | Notes for a future port |
|---|---|---|---|
| **Raw SQL migrations** (Postgres dialect) | `prisma/migrations/*` | ❌ | Enum DDL, `COLLATE "C"`, window-function backfills are Postgres syntax; would need per-engine branches. Biggest single cost. |
| **Postgres enum types** | `schema.prisma` enums | ⚠️ | Prisma maps these to native Postgres enums; other engines use check constraints or lookup tables. |
| **`rank` byte collation** `COLLATE "C"` | `20260720000000_rank_collation` | ❌ | Each engine sorts text differently; the LexoRank scheme needs a byte-ordered column per engine (ADR-0009). |
| **Full-text search** `tsvector`/`ts_rank` | Search module (planned) | ❌ | Postgres-only; other engines have their own FTS or need an external engine. |
| **`pg_trgm`** (fuzzy search) | planned | ❌ | Postgres extension. |
| **Row-Level Security** (tenant backstop) | planned (SEC-2) | ❌ | Postgres feature; other engines differ. |
| **PgBouncer** transaction pooling | ops / `DATABASE_URL` | ❌ | Postgres-specific pooler; operational, not code. |
| **`cuid()` id defaults** | app layer | ✅ | Generated in the app, engine-agnostic. |
| **Application / service / UI logic** | `src/features/*` | ✅ | Shielded by the repository pattern — the payoff of the discipline. |

## Rules that keep the option open (near-zero cost today)

1. Prefer Prisma-idiomatic queries over raw SQL wherever practical.
2. Keep every Postgres-only feature behind a clear seam (a repository method, a
   migration) and add it to the table above in the same change.
3. Never leak Prisma or SQL into services, components, or route handlers
   (already enforced by CLAUDE.md rule 4 + ESLint).

## Verdict

Staying Postgres-only is the current, deliberate decision. Multi-engine SQL is a
documented **V2/V3 option**, not built and not assumed. Adopting it would be a
scoped initiative addressing the table above — weeks of focused migration/feature
work, in this repo — and should be ratified in its own ADR with a real cost
estimate before any code is written.
