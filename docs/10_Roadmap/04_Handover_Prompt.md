# Handover prompt — EAGLES (paste into Claude Code in VS Code)

> Written 2026-11-07 at the end of a cloud session. Paste everything below the
> line into Claude Code, opened in the `project-atlas` folder.

---

You are taking over development of **EAGLES (Project Atlas)**, an internal
work-management platform (a Jira replacement) for a 500-person organisation,
built by a two-founder team. I am the founder/product owner. You are working
in my local clone in VS Code.

## 0. Before anything else

1. Read `CLAUDE.md` in full and follow it exactly. Its rules override your
   defaults: docs before code, never invent tables/fields/APIs, feature-first
   folders, Prisma only in `*.repository.ts`, RBAC in services, strict TS with
   no `any`, Zod for all input, audit fields + soft delete, log every deferral
   in `docs/10_Roadmap/02_Backlog_and_Tech_Debt.md`, conventional commits.
2. Note the Next.js warning in `CLAUDE.md`: this Next.js version differs from
   your training data. Read the relevant guide in `node_modules/next/dist/docs/`
   before writing Next.js code.
3. Run `git status`, `git branch --show-current` and `git log --oneline -5`
   and tell me what you see. Expected branch: `claude/project-atlas-init-q10cu7`,
   latest commit at or after `0107d42 feat(ui): fixed-size panels…`. If the
   tree is dirty or the branch is different, stop and ask me.

## 1. My standing rules for you

- **Ask before anything hard to reverse**: database schema, migrations, API
  routes/contracts, services/repositories, DTO or validation types, auth,
  permissions, deleting data, pushing to `main`, force-pushing. Presentation
  changes (components, styles, tokens, copy) you may do freely.
- **Real data only.** No fake numbers, sample people, trend arrows, meetings
  or goals that the data does not back.
- **Accessibility floor:** text contrast ≥ 4.5:1, nothing smaller than 11px,
  never colour as the only signal.
- **Never write secrets into the repo** (API keys, passwords, tokens). Use
  `.env`, which is git-ignored.
- **Show, don't claim.** After UI work, run the app and look at it (or
  screenshot it) before telling me it is done. Report test failures with their
  output.
- Explain decisions to me in plain language — I am not a deep frontend expert.

## 2. Where the project stands

**Built (34 modules, see `src/features/`):** auth (credentials + Google/Microsoft
ready), projects, issues, board, backlog, sprints, epics, comments, attachments,
notifications (in-app), reports, search, labels/components, custom fields,
workflow, dashboards, subtasks, dependencies, timeline, calendar, automations,
recurring issues, public API, GitHub/GitLab integration, time tracking, teams,
workload, saved views, bulk edit, admin/user management, profile, Home.

**Done in the last session on this branch (all tested, pushed):**
- Home redesigned to the approved reference
  (`docs/05_UI/reference/home-reference.webp`, ADR-0057,
  `docs/02_Modules/02_home.md`): greeting, 5 KPI tiles, My work (with a
  **Project** column), Needs your attention, Projects, Recent activity,
  Workload, right rail (Your focus, Upcoming, Continue working).
- New tokens (canvas `#FAFBFD`, ink `#0F172A`, muted `#596579`, border
  `#E9EDF3`), 214px sidebar with a navy eagle logo, flat 10px panels, the
  signed-in name in the top bar.
- **Fixed-size panel rule** (`docs/05_UI/01_UI_Design_Principles.md`
  §Fixed-size panels): panel height is set by the page and grows with screen
  height; longer lists scroll inside with a `.scroll-fade` edge shadow. Applied
  to Home and Dashboards.
- **Projects strip rule (BR-5):** at most 4 projects opened in the last 30
  days, starred first; stale ones hidden even if starred; cards fill the row.
- KPI tiles copy the reference icons/hues; Due and Blocked stay grey at 0.
- `scripts/visual-review/`: a ChatGPT-reviewed visual loop (needs
  `OPENAI_API_KEY` in your shell to run locally; `guard.sh` blocks backend
  changes during a loop).

**My decisions you must respect:** issue titles stay 12px (11px is for keys
and meta); red KPI only when the count is > 0; panels scroll inside rather
than grow; project-member avatars are ON HOLD until I give details; Quick
Actions on Home are excluded for now.

## 3. ⚠️ The most important open problem: two diverging UIs

`origin/main` has **43 commits from 2026-10-18** (a separate UI rebuild made
with another tool: "Antigravity" charter, pagination hook, rebuilt sidebar,
top bar, board, backlog, admin, issue workspace, plus several
"fix(syntax): repair chunk boundary escape" commits). This branch never had
them, and `main` never had this branch's 25 commits. Merge base: `13485c7`.

A trial merge conflicts in 14 files: `src/app/(app)/home/page.tsx`,
`src/app/(app)/projects/[projectId]/layout.tsx`, `src/app/globals.css`,
`src/features/board/components/{board-card,board-column,board-view}.tsx`,
`src/features/home/components/home-issue-row.tsx` (deleted here),
`src/features/home/components/home-section.tsx`,
`src/features/saved-views/components/cross-project-row.tsx` (deleted here),
`src/features/saved-views/components/issue-workspace.tsx`,
`src/shared/components/app-shell/{sidebar,top-bar}.tsx`,
`src/shared/components/ui/stat-tile.tsx`, `tailwind.config.ts`.
`main` also adds `@tanstack/react-table` and other dependencies.

**Agreed direction (confirm with me before executing):**
- Shared chrome, tokens and Home come from **this branch** (reviewed against
  the reference, fully tested).
- Page-level work from **`main`** (board, backlog, admin, issue workspace,
  pagination) is kept, then restyled to this branch's tokens and the
  fixed-size panel rule.
- Do it on a **new branch** (e.g. `ui/unify-main`), never directly on `main`.
  Check every `fix(syntax)` file from `main` for corrupted escapes. Run the
  full verification (§5), screenshot every main page, show me, and only push
  or open a PR after I approve.

## 4. Next work, in priority order (after the UI merge)

1. **Go-live blockers** (`docs/10_Roadmap/02_Backlog_and_Tech_Debt.md`,
   "🚩 Go-live blockers"): GL-9 VERUS demo data must never reach a real
   database; GL-10/REC-3 production scheduler cron; GL-13/BF-2 key custody for
   `CREDENTIAL_ENCRYPTION_KEY` and the GitHub App key; BF-1 backfill never run
   against real GitHub/GitLab; GL-2 security review; GL-7 load test (~60
   concurrent); GL-1 rotate seeded passwords; GL-4/GL-5 prod migrations and
   `connection_limit=1`; GL-6 SSO credentials. Many are configuration — tell
   me what I must do in Vercel/Supabase rather than guessing.
2. **HR time reports** (module 36: `docs/02_Modules/36_time_reports.md`,
   ADR-0056): doc done; repository + service with RBAC scope, then UI + CSV
   export, are not built.
3. **"Who can create projects"** — agreed in principle as one codebase with a
   per-organisation setting; needs a deep dive with me first (what "project
   leads can do that" means). Unblocks Home Quick Actions (HOME-9).
4. **Commercial readiness** (later): Jira importer, email notifications,
   multi-tenancy, billing, terms/licence.

Known pre-existing test failures (not caused by recent work): e2e
`labels-components` (UI-13 + duplicated account name in the sidebar), e2e
`profile` avatar (UI-12), flaky board drag, a board hydration mismatch from
dnd-kit ids, and a cycle-time query reading `afterData.status` against the
status name. Don't "fix" them silently inside unrelated work.

## 5. Local setup and verification

If the app is not running yet: Node 22, Docker Desktop, then
`docker compose -f docker/docker-compose.yml up -d db`; a `.env` (not
`.env.local` — Prisma only reads `.env`) with `DATABASE_URL`/`DIRECT_URL` =
`postgresql://eagles:eagles@localhost:5432/eagles?schema=public`,
`NEXTAUTH_URL`/`AUTH_URL` = `http://localhost:3000`, `AUTH_TRUST_HOST=true`,
`NEXTAUTH_SECRET` and `AUTH_SECRET` (same random value),
`STORAGE_PROVIDER=local`, `CREDENTIAL_ENCRYPTION_KEY` (64 hex chars); then
`npm install`, `npx prisma migrate deploy`, `npm run prisma:seed`
(admin@eagles.local / changeme-dev-only), `npm run dev`. Optional demo data:
`SEED_VERUS=confirm npm run seed:verus` (local only).

Verification before every commit: `npm run typecheck`, `npm run lint`,
`npm test`. For data-layer changes also run integration tests against a
**separate** database (they wipe tables): create `eagles_test`, then
`DATABASE_URL=…/eagles_test DIRECT_URL=…/eagles_test npx prisma migrate deploy`
and `npm run test:integration`. For UI flows: `npx playwright install chromium`
once, then `npm run test:e2e` (or one spec, e.g. `e2e/home.spec.ts`).

## 6. Your first reply to me

Report: branch + last commit, whether `npm install`/typecheck/tests pass
locally, whether the app runs at http://localhost:3000, and your step-by-step
plan for the UI merge in §3 (which files take which side, and how you will
verify). Then wait for my go-ahead.
