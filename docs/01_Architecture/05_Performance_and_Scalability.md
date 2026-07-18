# 05 — Performance & Scalability

This document is the standing engineering contract for keeping EAGLES fast
and scalable as it grows from a demo to real enterprise use. It records the
scale targets, a codebase-specific review, the standards every future
feature must follow, and a prioritized action plan. It is meant to be
re-read before each new module.

## Scale targets

| Dimension | Today | Near-term target | Long-term target |
|---|---|---|---|
| Employees per customer | tens | 1,000 | 10,000 |
| Concurrency | ~1 | 45–60% (≈600 concurrent) | 60% (≈6,000 concurrent) |
| Organizations (tenants) | 1 | hundreds | 10,000 |
| Issues | tens | hundreds of thousands | millions |
| Projects | tens | thousands | tens of thousands |

**Design rule:** we optimize for the long-term target's *shape*, not its
data volume today. Every decision is judged by "if EAGLES were 100× larger,
is this still the right approach?"

At ~6,000 concurrent users the app tier (stateless Next.js on serverless)
scales horizontally without effort. **The bottleneck is always the
database** — connections, unbounded queries, and missing indexes. This
document is mostly about protecting the database.

## Architecture verdict (2026-07-15 review)

The foundation is sound and does **not** need a rewrite. Feature-first
layering (UI → service → repository → Prisma), DTO projections, and the
Server-Component-fetches / Client-Component-mutates split are exactly the
patterns that scale. Because Prisma is isolated to `*.repository.ts`, every
performance fix below is a contained edit in one layer — that discipline is
what makes this cheap now.

## Connections (the #1 outage risk)

Serverless functions each hold their own Prisma connection pool, so raw
Postgres connections are exhausted fast under concurrency. The database
**must** sit behind a transaction pooler (Supabase PgBouncer, port 6543),
and `DATABASE_URL` must tell Prisma so:

```
DATABASE_URL="postgresql://…:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://…:5432/postgres"   # migrations only
```

`src/shared/lib/db.ts` logs a warning in production if the URL looks pooled
but is missing `pgbouncer=true`. **Verifying this env var in Vercel is a
release-blocking checklist item.**

## Pagination (never return an unbounded set)

Every list query is bounded by a keyset cursor. Offset pagination is banned
— it degrades linearly with depth. The reference implementation is the
issue list:

- `IssueRepository.listByProject(projectId, filters, { cursor, take })`
  fetches `take + 1` rows to detect a further page; `id` is the final
  `orderBy` tiebreaker so the ordering is total and the cursor is stable.
- `IssueRepository.countByStatus` returns per-status totals via `groupBy`,
  so the filter chips stay accurate independent of what's been paged in.
- `IssueService.list` returns `{ items, nextCursor, counts }`
  (`IssueListPageDto`).
- The UI (`issues-view.tsx`) is server-driven: changing a status filter
  refetches page 1 for that filter; "Load more" appends the next cursor.

`DEFAULT_PAGE_SIZE = 50`, `MAX_PAGE_SIZE = 100` (`issue.repository.ts`).

## Indexes (every query ships with its covering index)

An index must cover a query's `WHERE` **and** its `ORDER BY`, or Postgres
sorts in memory. Current composites (`prisma/schema.prisma`,
migration `20260715000000_perf_indexes`):

| Query | Index |
|---|---|
| Issue list/board: `WHERE projectId,status ORDER BY boardOrder` | `issues(projectId, status, boardOrder)` |
| "My open issues" (dashboard): `WHERE assigneeId, status` | `issues(assigneeId, status)` |
| Per-entity activity timeline: `WHERE entityType,entityId ORDER BY createdAt` | `audit_logs(entityType, entityId, createdAt)` |
| Org activity feed | `audit_logs(organizationId, createdAt)` |

**Future:** a partial index `WHERE deletedAt IS NULL` on issues (Prisma's
schema DSL can't express partial indexes, so add it as raw SQL in a
migration). At real table sizes, create indexes `CONCURRENTLY` in a
separate step so `CREATE INDEX` doesn't lock writes.

## Request lifecycle & redundant work

- **Session decode is request-cached.** `getSession`/`getActor`
  (`actor.service.ts`) are wrapped in React `cache()`, so a layout + its
  page verify the JWT once, not two–three times.
- **Parallelize independent awaits.** Pages `Promise.all` their fetches
  (`issues/page.tsx`); the service pages issues and counts in parallel.
- **Done:** `organizationId` is now on the session JWT (with a DB fallback for
  pre-existing tokens), so `ProjectService.list`/`create` use `actor.organizationId`
  instead of a per-request `user → organizationId` lookup. Shipped with the F-1
  tenant-isolation fix (see `docs/08_Testing/01_Testing_Strategy.md`).

## Dashboard strategy (design before it grows)

The dashboard is minimal today, which is the moment to lock the pattern for
when it gains "assigned issues" and "recent activity":

1. Each widget is its own `<Suspense>` boundary that streams independently
   (shell + fast widgets paint immediately). Extend `dashboard/loading.tsx`
   into per-widget skeletons.
2. Every widget query is bounded (`take: 5–10`) and fetched in parallel.
3. Never one mega-query for the whole page.

## Frontend

Server/Client split is correct. Watch items:

- Long lists must be **paginated** (done for issues) and, once page sizes
  climb, **virtualized** (`@tanstack/react-virtual`). Until then, keep row
  entrance animations capped (the issue list caps stagger delay).
- No code-splitting concerns at current bundle size; revisit if any route's
  First Load JS exceeds the budget below.

## Engineering standards (every future feature)

1. **Bounded reads.** Every list repository method takes a keyset cursor +
   capped `take`. No method may return an unbounded set.
2. **Tenant-scoped reads.** Every repository read is scoped by
   `organizationId` or `projectId` — never a bare global id that relies
   solely on a later service check. (Defense-in-depth: Postgres RLS later.)
3. **Projections always.** `select` only the columns the DTO needs; never
   return a whole row for a list view. Never leak Prisma models — return
   DTOs.
4. **Index with the query.** A new `WHERE`/`ORDER BY` ships with a covering
   index in the same PR, verified against the actual query shape.
5. **Parallelize + cache.** Independent awaits use `Promise.all`;
   per-request context (session, actor, org) is `cache()`-wrapped.
6. **Rendering.** Server Components fetch; Client Components exist only for
   interactivity and receive server data as props.
7. **RBAC server-side** in the service layer, always (see `15_roles.md`).
8. **Audit off the hot path** once volume grows — move `AuditLogService`
   writes to a queue rather than blocking the request.

### Performance budgets

| Metric | Budget |
|---|---|
| List API P95 | < 200 ms |
| Any single query | bounded (never a full-table scan or unbounded set) |
| Route First Load JS | < 250 kB |
| Largest Contentful Paint (app pages) | < 2.0 s |

## Future-proofing flags (plan, don't build yet)

- **Search** — no full-text index exists. The Search module needs Postgres
  `tsvector`/`pg_trgm` or a dedicated engine. Decide before building it.
- **`boardOrder`** is currently `Date.now()` (`issue.repository.ts`); the
  Board module needs true fractional ranking (LexoRank-style) for reorders.
- **Unbounded tables** — `audit_logs` and `notifications` grow forever;
  plan retention/partitioning before they are large.
- **Read replicas** — at ~6,000 concurrent, route read-only queries to a
  replica. The repository layer makes this a one-place change.

## Action plan & status

### 🔴 Critical
- [x] Verify serverless pooling (`pgbouncer=true`) — runtime warning added;
      **env var still to be confirmed in Vercel.**
- [x] Keyset pagination on the issue list (repo → service → API → UI).
- [x] Covering indexes for issue list, "my issues", and activity timeline.

### 🟠 High
- [x] Carry `organizationId` on the session; drop the per-request user
      lookup in `ProjectService.list` (shipped with the F-1 fix).
- [ ] Extend pagination to `ProjectRepository.listActiveWithMembership` and
      `listMembers` when those lists can grow large.
- [ ] Lock the streamed, capped, parallel dashboard-widget pattern when the
      dashboard module lands.

### 🟡 Medium
- [ ] Virtualize long lists once page sizes climb.
- [ ] Structured logging + rate limiting (only `console.error` today).
- [ ] Move audit-log writes off the request hot path.

### 🟢 Nice to have
- [ ] Postgres RLS as a tenant-isolation backstop.
- [ ] `audit_logs` / `notifications` retention & partitioning.
- [ ] Read-replica routing for read-heavy endpoints.
