# 08 — Testing Strategy

How we prove EAGLES works before shipping. Layered, cheapest-first, and tied
to the acceptance criteria in the module docs. This was established in the
Hardening Sprint (before the Board module) to close the gap between our
documented standards and actual coverage.

## The layers

| Layer | Runs against | Proves | Where |
|---|---|---|---|
| **Unit** | Pure logic, mocked repo | Business rules & workflow in isolation | `src/**/*.test.ts` |
| **RBAC matrix** | Service + mocked repo | Every (role × action) allow/deny — the `15_roles.md` standard | `*.rbac.test.ts` |
| **API contract** | Route handlers, mocked services | Auth guard, Zod validation, status codes, error→HTTP mapping | `src/app/api/**/route.test.ts` |
| **Integration** | **Real Postgres** | Actual SQL: pagination, soft-delete, key-gen under concurrency, tenant isolation | `src/**/*.integration.test.ts` |
| **E2E** | Real browser + app | Full user flows across UI+API+DB | `e2e/**` (Playwright) |

## Running the tests

```bash
npm test               # unit + RBAC + API contract (no infra needed)
npm run typecheck      # tsc --noEmit
npm run lint

# Integration — needs a throwaway Postgres:
docker run --rm -d --name eagles-test-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=eagles_test -p 5433:5432 postgres:16
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/eagles_test?schema=public"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy        # applies migrations, incl. perf indexes
npm run test:integration
```

Integration tests **must** point at a disposable database — never Supabase
production. They `TRUNCATE ... CASCADE` between tests.

## What integration tests currently prove

- **Keyset pagination** — 120 issues page cleanly (50/50/20) with no duplicates
  or gaps; per-status counts stay accurate and independent of the page.
- **Soft delete** — a `deletedAt` row vanishes from list, detail, and counts.
- **Key generation under concurrency** — 25 racing `createWithKey` calls yield
  unique, contiguous keys (the `$transaction` increment holds; no lost updates).
- **Tenant isolation (partial)** — `ProjectService.list` is org-scoped;
  `IssueRepository.listByProject` is project-scoped.

## Open findings (from the sprint)

### 🔴 F-1 — Cross-org read via bare ID (latent; decide before multi-tenancy)
`IssueService.get`, `IssueService.list`, and `ProjectService.get` resolve a row
by its ID and check only the caller's **project membership/role** — they do not
verify the row belongs to the caller's **organization**. A user in Org A who
knows an Org B issue/project ID can **read** it (write paths remain blocked —
`canEdit`/`canDelete` are false).

- **Impact today:** none — V1 is single-org, so there is no second tenant to
  leak to.
- **Impact at multi-tenancy:** a cross-tenant data-read breach. Must be fixed
  before a second organization exists.
- **Why not fixed now:** the clean fix requires the actor to carry
  `organizationId` (the deferred session change in
  `docs/01_Architecture/05_Performance_and_Scalability.md`) so services can
  assert `row.organizationId === actor.organizationId`. That touches the
  auth/session model — a founder decision, not a silent mid-sprint change.
- **Pinned by:** the `KNOWN GAP` test in `data-layer.integration.test.ts`,
  which documents current behavior so the fix will flip it and force review.

## Still to add (tracked)
- **E2E (Playwright)** — happy path (sign in → project → issue → workflow →
  filter → load more) plus RBAC negatives (VIEWER read-only, non-member
  blocked). Scaffold pending; needs a running app + seeded test DB.
- **Concurrency on edit** — two users transitioning the same issue.
