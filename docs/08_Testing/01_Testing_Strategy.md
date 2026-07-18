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

# E2E — same test DB, seeded, plus a NextAuth secret. Boots `next dev` itself.
npm run prisma:seed              # creates loginable users (see prisma/seed.ts)
export NEXTAUTH_SECRET="any-non-empty-value-for-local"
npm run test:e2e
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

### ✅ F-1 — Cross-org read via bare ID — RESOLVED
**Was:** `IssueService.get`/`list` and `ProjectService.get` resolved a row by ID
and checked only project membership — not the caller's organization — so a user
could **read** another org's issue/project by ID.

**Fix:** the `Actor` now carries `organizationId` (put on the session JWT in the
`jwt`/`session` callbacks; `getActor` reads it, with a DB fallback so existing
sessions aren't logged out). Every service scopes by it: `IssueService.resolve`
and `ProjectService.requireProject` throw `NotFoundError` when a row's org ≠ the
caller's — cross-tenant access is now **fail-closed and doesn't reveal
existence** (NotFound, not Forbidden). This also dropped a per-request user
lookup in `ProjectService.list`/`create` (they use `actor.organizationId`).

**Proven by:** the flipped test in `data-layer.integration.test.ts` (cross-org
`get` → NotFound) and `security.integration.test.ts` (cross-org update/delete/
transition → NotFound, even for an org ADMIN).

## E2E coverage (implemented)
`e2e/issues.spec.ts`, run against a real browser + production build + seeded
Postgres:
- **LEAD** signs in with credentials, opens the demo project, creates an issue,
  and sees it appear (full UI → API → DB round trip, with the success toast).
- **VIEWER** sees the issues list but gets **no** create control.

## Still to add (tracked)
- E2E for the full workflow walk (TODO→…→DONE) and "Load more" at >50 issues.
- **Concurrency on edit** — two users transitioning the same issue.
