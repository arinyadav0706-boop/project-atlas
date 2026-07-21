# EAGLES — Session Handover (for the next Claude)

**Last updated:** 2026-07-21 · **Default branch:** `main` (latest merged: PR #29) ·
**Working branch:** `claude/project-atlas-init-q10cu7`

Read `CLAUDE.md` first (non-negotiable rules), then this. This file is the fast
path to being productive without re-deriving everything.

---

## 1. What this is

**EAGLES** (codename "Project Atlas") — an internal, premium Jira-replacement for a
~500-person org, built by a 2-founder team. Documentation-first, architecture-first,
built for future scale. The user (Arin) is the founder acting as product owner; you
are the Founding CTO/engineer.

**Program phase:** Phase 4/5 — building MVP feature modules. Core done: Auth,
Projects, Issues, Board, Home, **Backlog**, **Sprint**. Next planned: **Comments**,
then Attachments, Notifications, Reports, Search, Admin.

### User's standing values (respect these)
- **Think about future/scale relentlessly**, but **don't over-engineer** or create
  tech debt. Build what the current doc/PRD needs (CLAUDE.md rule #10).
- **Don't be a yes-man.** Push back with honest trade-offs. Own mistakes plainly.
- **Documentation-first**: every feature has a module doc + ADR before code.
- **Depth bar (set 2026-07-21): "full Jira-parity per module."** Ship a lean core,
  then a browser-verified hardening/completeness pass before moving on. Flag scope
  cuts explicitly — never silently skip.
- **UI is deliberately "basic but systematized" until MVP is functionally complete**,
  then a premium re-skin (UX-1). Sign-in is the one premium exception.
- Be **brief and to the point** when asked.

---

## 2. Tech stack

Next.js 14 (App Router) · TypeScript strict (no `any`) · Tailwind + shadcn/ui ·
dnd-kit · Zod · React Hook Form · sonner (toasts) · Prisma + PostgreSQL
(Supabase, Mumbai/ap-south-1) · Auth.js (NextAuth v5, credentials + SSO-ready).
Tests: Vitest (unit + integration) · Playwright (e2e). Node/tsx for scripts.

---

## 3. Architecture (how the code is organized — enforced)

Feature-first: `src/features/<feature>/{components,hooks,services,repositories,validation,types,api}`.

- **Repository pattern (mandatory):** Prisma is imported **only** in `*.repository.ts`
  (ESLint `no-restricted-imports` enforces it). Route handlers call **services**;
  services call **repositories**. Components/routes never import a repository's Prisma.
- **Services own RBAC + business logic**, server-side, per the actor's role. Actor =
  `{ userId, orgRole, organizationId }` from `getActor()`.
- **DTOs never leak Prisma models.** Map rows → DTOs in the service.
- **Thin route handlers** via `handleRoute()` (`src/shared/lib/api.ts`) — it maps
  errors to HTTP: `ForbiddenError→403`, `ConflictError→409`, `NotFoundError→404`,
  `ValidationError`/`ZodError→422`, `UnauthorizedError→401`. Adds Server-Timing.
- **Cross-feature seam:** features depend on other features' **services**, not their
  repositories (e.g. `ProjectService.getContext` / `getMemberRole`). One documented
  bend: `SprintService` calls `IssueRepository` for the issue move (owns the write).
- **Tenant scope (F-1):** every read/write is scoped to `actor.organizationId`; a
  cross-org resource is treated as **absent** (NotFound), never leaked.
- **Every entity has audit fields** (`createdAt/updatedAt/createdBy/updatedBy/deletedAt`).
  **Soft delete only** — no hard deletes from app code (one exception: `Favorite`
  unstar hard-deletes, documented).
- **Validate everything external with Zod**; one schema per action, shared client/server.

### Key engineering decisions (ADRs — see `docs/11_ADR/`)
- **0009** LexoRank-style string fractional ranking (`fractional-indexing`, base-62)
  for ordering. **`rank` column is `COLLATE "C"`** (byte order) — locale collation
  silently breaks mixed-case key ordering. Set in migration, Prisma leaves it alone.
- **0010** Collision-free rank keys: `rank = <fractionalKey>#<suffix>` (suffix =
  last-4 of actorId + 8 random base-62). Unique index `(projectId, status, rank)`.
- **0011** Optimistic concurrency (OCC): `version Int` per issue; conditional
  `updateMany WHERE version = expected` → null on lost update → `ConflictError` (409).
  Clients send the version they read; stale writes are rejected, not silently merged.
- **0012** Home = unified attention model (fixed sections, not per-module gadgets).
  `RecentItem` (engagement) + `Favorite` (pins) tables.
- **0013** One `rank` per issue, many views. Reorder carries a `scope`
  (`board` default | `backlog`) selecting neighbour validation. Index
  `(projectId, sprintId, rank)`.
- **0014** Sprint assignment = dedicated `PATCH /issues/{id}/sprint` move endpoint
  (atomic sprintId + rank + OCC). Sprint lives as a section on the Backlog page.
  Progress is **derived** (`GROUP BY status`), never stored. COMPLETED sprint frozen.
- **0015** Multi-sprint planning: Backlog page shows every non-completed sprint
  (ACTIVE + all PLANNED) as its own droppable section; drag into any. Panel DTO →
  `sprints[]`. No schema change.

---

## 4. Modules — status

| Module | State | Notes |
|---|---|---|
| Auth | ✅ | Auth.js credentials; SSO configurable/deferred (ADR-0003/0005). |
| Projects | ✅ | Create (creator→LEAD), members/roles, archive. RBAC via `ProjectService`. |
| Issues | ✅ | CRUD, fixed workflow TODO→IN_PROGRESS→IN_REVIEW→DONE, key `PROJ-N`, OCC, audit. |
| Board | ✅ | dnd-kit columns, composable filters (ADR-0008), reorder via `/rank`, VIEWER read-only. |
| Home | ✅ | Streamed `<Suspense>` sections; My Work, Continue, Due soon, Attention, Projects strip. |
| Backlog | ✅ core | Ordered unscheduled issues, drag reorder, keyset pagination. **Gaps below.** |
| Sprint | ✅ core | Create/start/complete/edit/delete, multi-sprint, history, dates/overdue, progress, row menu, star. **Gaps below.** |
| Comments | ⛔ next | Not started. `comments` table exists in schema. |
| Attachments, Notifications, Reports, Search, Admin | ⛔ | Planned; some tables exist. |

### Backlog + Sprint — Jira parity, brutally honest (~70%)
**At parity:** create/order/drag/reorder, backlog↔sprint & sprint↔sprint moves,
multi-sprint sections, sprint lifecycle (start/complete/edit/delete), history,
dates+overdue, count-based progress, star project, per-row "…" move menu, RBAC, OCC.

**Missing / partial (all logged, none architecture-blocked):**
- Inline "create issue" at bottom of backlog (Jira fast-add) — we create via Issues tab.
- Backlog/sprint **search** (SP-2) & **filters** (SP-3); **epics/versions panels**; bulk select/move.
- Inline edit of assignee/points/labels from a row.
- Complete → **move incomplete to next sprint** (only backlog today) — FUT-5.
- **Reorder the sprint queue** by dragging sprints — FUT-8 (needs a sprint-level order key).
- **Burndown / velocity** — SP-1, Reports module (reconstructable from `audit_logs`).
- Sprint **capacity** / points-vs-capacity; duration presets (1w/2w); auto start/complete.
- Depends on unbuilt modules: **Search (⌘K), Notifications, Reports, Labels/Epics wiring**.

See `docs/10_Roadmap/02_Backlog_and_Tech_Debt.md` items **SP-1…SP-7, FUT-5, FUT-8**.

---

## 5. Data model highlights (`prisma/schema.prisma`)

- **Issue**: `rank String` (COLLATE "C"), `version Int`, `sprintId String?`, `status`,
  `priority`, `type`, `assigneeId`, `reporterId`, `epicId`, `storyPoints`, soft-delete.
  Indexes: `@@unique([projectId,key])`, `@@unique([projectId,status,rank])`,
  `@@index([projectId,sprintId,rank])`, `@@index([sprintId])`, `@@index([assigneeId,status])`.
- **Sprint**: `name`, `goal?`, `status` (PLANNED/ACTIVE/COMPLETED), `startDate?`,
  `endDate?`, soft-delete. `@@index([projectId,status])`. No sprint-level order key yet.
- **RecentItem**, **Favorite** (Home). **AuditLog** (records `ISSUE_STATUS_CHANGED` etc.
  with timestamps — the future burndown's data source).
- Tables present but not fully wired: `comments`, `attachments`, `labels`, `issue_labels`,
  `notifications`, `organizations` (multi-tenant groundwork, no UI in V1).

---

## 6. Key files map

- Rank util: `src/shared/lib/rank.ts` (`rankBetween`, `rankAppend`, `ranksBetween`).
- Route helper/errors: `src/shared/lib/api.ts`, `src/shared/lib/errors.ts`.
- Issues: `src/features/issues/{repositories,services,validation,types}` + routes under
  `src/app/api/issues/[issueId]/{route,transition,rank,sprint}`.
- Board: `src/features/board/*`, page `src/app/(app)/projects/[projectId]/board`.
- Backlog: `src/features/backlog/*`, API `.../projects/[projectId]/backlog`.
- Sprint: `src/features/sprints/{repositories,services,validation,types,components}`,
  routes `.../projects/[projectId]/sprints` + `.../sprints/[sprintId]/{route,start,complete}`.
  The Backlog page renders **`SprintPlanningView`** (the whole planning UI).
- Home: `src/features/home/*` (incl. `favorite.service.ts`, `recent-item.service.ts`).
- Project shell/header (star, tabs): `src/app/(app)/projects/[projectId]/layout.tsx`.

---

## 7. Run & test locally (IMPORTANT — the env resets between sessions)

**Local Postgres stops on session resume.** Start it first:
```
pg_ctlcluster 16 main start          # cluster on localhost:5432, db eagles_test, user/pass postgres
```
The repo `.env` points `DATABASE_URL` at **prod Supabase** — the sandbox **cannot reach
prod** (network blocked). For anything local, override:
```
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eagles_test?schema=public"
export DIRECT_URL="$DATABASE_URL"
```

- **Unit tests** (no DB needed for most; some mock repos): `npx vitest run` (~209 tests).
  Note: unit tests that touch `RecentItemService`/DB must mock it — see existing mocks.
- **Integration** (real Postgres): `export` the URLs above, then
  `npx vitest run --config vitest.integration.config.ts` (~40 tests). `fileParallelism:false`.
- **Migrate + seed local**: `npx prisma migrate deploy` then `npm run prisma:seed`.
  Seeded login: `kavya.iyer@consint.ai` / `Passw0rd!` (LEAD on "EAGLES Demo");
  founder admin `arin.yadav2021@vitalumn.ac.in` / `ARIN@321`. All team users: `Passw0rd!`.
- **E2E (Playwright, real browser)** — this is how you verify UI (see §9):
  ```
  export DATABASE_URL/DIRECT_URL (local)   # as above
  export NEXTAUTH_SECRET=dev-e2e-secret-000000000000000000000000
  export NEXTAUTH_URL=http://localhost:3000 ; export AUTH_SECRET="$NEXTAUTH_SECRET"
  export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  # reset DB for isolation, then seed:
  npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.\$executeRawUnsafe('TRUNCATE \"organizations\" RESTART IDENTITY CASCADE').then(()=>p.\$disconnect())"
  npm run prisma:seed
  npx playwright test e2e/sprint-drag.spec.ts
  ```
  Playwright `webServer` does `next build && next start` on :3000 (reuseExistingServer).
  Chromium is preinstalled — never run `playwright install`.
- **Build**: `npm run build`. **Typecheck**: `npx tsc --noEmit`. **Lint**: `npx eslint .`.

---

## 8. Deploy / prod state (READ before anything prod-related)

- Prod = Vercel + Supabase (Mumbai). **Prod schema was created manually → no Prisma
  migration history.** The **deploy pipeline is HELD by the user** (we wrote a
  `vercel-build` runbook but did NOT wire `prisma migrate deploy` into deploys, because
  it would break builds before a prod baseline exists, which needs prod access we lack).
- **GL-4 (go-live blocker):** baseline prod migration history + apply all migrations
  (`perf_indexes, board_rank, rank_collation, rank_unique, issue_version,
  home_personalization, backlog_index`). The **sprints table is in the init migration**
  (no new migration for Sprint). The sandbox can't reach prod, so schema changes are
  delivered to the user as **SQL to run in the Supabase editor**.
- **Past prod outage lesson:** code shipped ahead of schema (queried `rank` while prod
  had `boardOrder`) → 500s. Always confirm prod schema exists before merging
  schema-dependent code.

---

## 9. Working discipline (hard-won this session — follow it)

- **Verify UI in a real browser, not just tests.** This session shipped 3 UI bugs that
  all passed unit+integration because those test the data layer, not clicks/drags:
  (1) "Create sprint" hidden (canManage read off a null object), (2) drag hijacked by
  the title `<a>`'s native link-drag (fixed: whole row draggable + `draggable={false}`),
  (3) stale sprint issues after complete (fixed: re-sync state on prop change). When a
  change has a runtime surface, **drive it with Playwright**. dnd-kit needs a hardened
  pointer-drag (down → 5px activation move → stepped moves → settle delay → up); see
  `e2e/sprint-drag.spec.ts` `pointerDrag`. Make each e2e create its **own project** for
  isolation (shared demo project caused flakiness).
- **Git workflow (the branch keeps diverging — do this every time):** after a PR merges
  (squash) into `main`, the working branch still holds the pre-squash commit, so the next
  PR conflicts. Fix: `git fetch origin main && git checkout -B <branch> origin/main &&
  git cherry-pick <your-new-commit> && git push --force-with-lease`. PRs merge as **squash**.
  Never stack new work on already-merged history.
- **Commit trailers** (required): end commits with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and the `Claude-Session:` line.
  **Do NOT** put the model identifier in commits/PRs/code — chat only.
- **Only open a PR when the user asks**; this session the user asks to merge each time.
- **Don't** disable TLS / unset `HTTPS_PROXY`. Use the GitHub MCP tools (`mcp__github__*`),
  not `gh`.

---

## 10. Tech-debt / go-live pointers (`docs/10_Roadmap/02_Backlog_and_Tech_Debt.md`)

- **GL-1** rotate seeded known-password accounts before real users.
- **GL-4 / DB-2** prod migration baseline + apply indexes (held pipeline).
- **DB-6** `rank` COLLATE "C" (in code; apply to prod = part of GL-4).
- **DB-8** OCC done for reorder/edit/transition; delete-OCC + re-rank repair tool deferred.
- **PERF-13** move `RecentItem` writes off the hot path (queue) at volume.
- **TD-1** consolidate the 5 near-identical `IssueListItemDto` mappers.
- **SEC-2** Postgres RLS as a tenant backstop (V2).
- **SP-1…SP-7, FUT-5, FUT-8** the backlog/sprint gaps from §4.
- **UX-1** premium re-skin (whole app), after MVP is functionally complete.
- **TEST-4/5/6** browser E2E coverage (sprint has it; board/backlog partial).

---

## 11. Suggested next steps

1. **Comments module** (next planned, full parity, documentation-first) — `comments`
   table exists; threaded discussion on issues.
2. OR close the in-module Backlog/Sprint gaps first if the user wants Sprint 100% before
   moving on: inline backlog create, complete→next-sprint (FUT-5), sprint-queue reorder
   (FUT-8), points-sum/capacity.

Ask the user which; they set the "full Jira-parity per module" bar, so name the scope
explicitly and don't silently trim.
