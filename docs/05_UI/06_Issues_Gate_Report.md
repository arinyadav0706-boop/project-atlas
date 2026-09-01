# 06 — `/issues` implementation gate

- **Status:** Awaiting approval. **Stopped here by instruction** — no other page
  has been migrated.
- **Date:** 2026-08-27
- **Covers:** Phase 0 (regression safety), dependency decision, design tokens,
  layout primitives, and the `/issues` rebuild.

---

## 1. Headline: the numbers moved, and two unrelated defects fell out

Measured on the same machine, same seed, same browser as the audit.

| Metric | Before | After | |
|---|---|---|---|
| Dead gutter each side @1920 | **168px** | **0** | ✅ |
| Usable content width @1920 | 1280px | **1680px** | **+400px** |
| Row height | 44–45px | **32px** | ✅ |
| Rows visible @1080 | ~15 | **~28** | **+87%** |
| Document scroll @1080 | 2567px | **1080px** | no document scroll |
| Chrome above first row | n/a (2 filter rows, wrapped) | **176px** | one toolbar row |
| Content width @1440 / @1280 | 1136 / 1136 | **1200 / 1040** | full-bleed |

Chrome breaks down as: top bar 56 + page header 44 + toolbar 40 + column
header 36. The 56px top bar is the **only** part still on the old shell; it
drops to 48 when the global flip happens after this gate.

## 2. Two defects Phase 0 found that have nothing to do with the UI

**SEED-10 — the demo project could not create issues.** `POST
/api/projects/seed-demo-project/issues` returned **500: "Project
seed-demo-project has no default status."** Module 30 made statuses per-project
data; `ProjectRepository.create` seeds them, but `prisma/seed.ts` writes the
project row directly and was never updated. The project every local-dev
instruction points at has been unusable for the product's most basic action
since module 30 shipped. The failing E2E test had been read as flake.

**E2E-1 — the safety net was tripping the brute-force limiter.** Every spec
posted credentials in every test; login allows 8 attempts / 15 min per IP+email.
A full run made **16 attempts as one user in one window** (measured in
`rate_limits`), so eleven tests failed with `CredentialsSignin`. Fixed in the
harness — a setup project signs each user in once and specs restore the session.
**The limiter was not weakened.** Full run: 12.6 min → 5.8 min.

## 3. Dependencies: none installed

Full reasoning in `05_Dependency_Review.md`. Summary: all five proposals
deferred, each with a named trigger. `/issues` is built entirely on what was
already in `package.json`.

Two corrections to the audit are recorded there: the "~37 kB" figure was
recalled rather than measured and was wrong in composition, and the claim that
no E2E suite existed was simply false — there were 14 specs and 26 tests.

**Bundle delta: 0 kB of new dependencies.** Baseline for future comparison:
725 kB gzipped across all client chunks.

## 4. What changed, and what deliberately did not

**Presentation only.** Every hook, handler and effect in `IssueWorkspace` is
byte-identical: the request-race guard, URL mirroring via `replaceState`,
cursor pagination, shift-click range selection, the single-project bulk-status
rule, `applyBulk`'s per-failure toasts, saved-view dirty detection, and the
`projectsInScope === 0` empty-state distinction (BR-3).

| Preserved | Where it moved |
|---|---|
| Search, 6 filter facets, clear | Wrapped two rows → one toolbar row |
| Saved views: select, clear, delete | 15rem left rail → toolbar `ViewSwitcher` |
| Selection + bulk action bar | Unchanged logic; count strip now appears only when something is selected |
| Load more | Toolbar trailing edge |
| Custom-field predicates | Toolbar |
| Corrupt-filter warning | Full-width strip under the toolbar |

**New capability: sortable column headers.** Not new functionality — `sort`
state and every token (`UPDATED_DESC`, `PRIORITY_ASC`, …) already existed and
were already accepted by `/api/issues`; there was simply no control for them.

**Deleted:** `cross-project-row.tsx` and `view-rail.tsx`, both fully replaced.

## 5. New shared primitives — nothing page-specific

- `shared/components/layout/app-frame.tsx` — `AppFrame`, `WorkspaceHeader`,
  `Toolbar`, `Workspace`
- `shared/components/data/data-table.tsx` — `DataTable` with a typed column
  model (`id`, `header`, `width`, `align`, `sortKey`, `cell`, `hideBelow`)
- `features/saved-views/components/issue-columns.tsx` — the column definitions
- `features/saved-views/components/view-switcher.tsx`

`DataTable`'s API is deliberately the one a table library would need, so
adopting TanStack later replaces the internals of one file and no consumer
changes.

## 6. Tokens, and the guard that makes them stick

Additive only — no existing token renamed or re-valued, so the 31 unmigrated
pages render identically. Added: `primary` (+ foreground), `surface-sunken`,
`surface-raised`, `border-subtle`, `border-strong`, `info`, `focus-ring`,
`input`, `popover`; a six-role type scale; three radii (`chip`/`control`/`panel`
at 4/6/8px) under **new names**, because re-valuing `rounded-2xl` would restyle
every panel in one commit.

**UX-2 guard shipped** (`src/tests/design-tokens.test.ts`): every colour-like
utility in `src/` must name a colour the theme defines. On its first run it
found **two more shipped instances of the same bug** — `border-input` on the
epic select (no border rendered) and `bg-popover` on the comment composer (no
background). Both were invisible to typecheck, lint and build.

## 7. Known gaps, stated plainly

- **The top bar is still 56px** and the global `<main>` padding is unchanged;
  `AppFrame` cancels it with negative margins for this page only. That is
  deliberate for the island phase and is removed by the global flip.
- **No virtualization.** 36 rows render today; `Load more` appends. Fine now,
  and `react-virtual` has a named trigger (>500 rows in one DOM).
- **Density is not user-selectable.** One good default, as instructed.
- **`/issues` is the only migrated page.** Nine remain.

## 8. Regression evidence

See §9 of this file for the run recorded at gate time: unit, integration, E2E,
build, typecheck, lint, and screenshots at 1920 / 1440 / 1280.
