# 06 — `/issues` implementation gate

- **Status:** Awaiting approval. **Stopped here by instruction** — no other page
  has been migrated.
- **Date:** 2026-09-01
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
| Chrome above first row | n/a (2 filter rows, wrapped) | **180px** | one toolbar row |
| Content width @1440 / @1280 | 1136 / 1136 | **1200 / 1040** | full-bleed |

Chrome breaks down as: top bar 56 + page header 44 + toolbar 44 + column
header 36. The 56px top bar is the **only** part still on the old shell; it
drops to 48 when the global flip happens after this gate.

Measured against the VERUS demo org (7,300 issues across four projects), not
the five-issue demo project — a dense table is only honestly measured on dense
data. Page size is 50; 28 rows are visible at 1080 without scrolling.

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
| Search | Stays inline in the toolbar |
| 6 filter facets + "Assigned to me" | Wrapped two rows → a **Filters panel**, with a chip per active facet (§4a) |
| Clear | Toolbar, beside the chips; "Clear all" also in the panel |
| Saved views: select, clear, delete | 15rem left rail → toolbar `ViewSwitcher` |
| Selection + bulk action bar | Unchanged logic; count strip now appears only when something is selected |
| Load more | Toolbar → the end of the rows, inside the scroller |
| Custom-field predicates | Toolbar → the Filters panel |
| Corrupt-filter warning | Full-width strip under the toolbar |

### 4a. The correction the screenshots forced

The first build of this toolbar put all eight controls in one `flex-nowrap`
row. Measured at 1920 it **still overflowed**: "Blocked or not" wrapped inside
its own trigger, "Assigned to me" was clipped, and **"Clear" was off-screen
entirely**. At 1280 five of the eight controls were unreachable. The row had an
`overflow-x-auto`, so nothing was technically lost — but a filter you can only
reach by horizontally scrolling a strip with no scrollbar is a filter nobody
finds.

Arithmetic that should have been done before the first version: the controls
need ~1,400px, the toolbar has 1,008px at 1280 and 1,648px at 1920 once the
view switcher and the count are placed. **Eight dropdowns do not fit at any
width this product targets.**

So `/issues` now does what Jira, ClickUp and Linear all do: one **Filters**
button with an active count, a panel holding every facet, and a **removable
chip per active filter** in the toolbar. The chips matter more than the button
— a bare "Filters (3)" tells you a filter exists but not which one is hiding
the issue you came looking for.

No facet was removed, no query parameter changed, and `layout="wrap"` (timeline,
calendar, the dashboard widget dialog) is untouched.

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
- **No virtualization.** 50 rows render per page; `Load more` appends at the
  end of the list. Fine now, and `react-virtual` has a named trigger (>500 rows
  in one DOM).
- **Density is not user-selectable.** One good default, as instructed.
- **`/issues` is the only migrated page.** Nine remain.

## 8. Regression evidence

Recorded at gate time, in this order, on a database re-seeded from scratch
(`prisma:seed` + `seed:verus`) because the integration suite truncates it.

| Check | Result |
|---|---|
| Unit (`npm test`) | **1222 passed**, 83 files, 7.2s |
| Integration (`npm run test:integration`) | **355 passed**, 31 files, 74s |
| E2E (`npx playwright test`) | **35 passed, 2 failed, 1 flaky, 1 skipped**, 3.5 min |
| `/issues` + shell specs on their own | **11 passed, 1 skipped** |
| `npm run build` | clean |
| `npx tsc --noEmit` | clean |
| `npx eslint` on changed areas | clean (one pre-existing warning in `theme-toggle.tsx`, untouched) |

**The two E2E failures are pre-existing and unrelated to this work.** Both were
reproduced on a pristine database, so neither is test-data accumulation:

- `profile.spec.ts` — a new avatar updates the profile page but **not the
  header**. `updateSession()` is called and the JWT callback has a
  `trigger === "update"` branch that re-reads `avatarUrl`, so the chain exists
  and does not complete. Localised, not root-caused. → backlog **UI-12**.
- `labels-components.spec.ts` — the component-owner dropdown offers no members
  on a newly created project, even though `ProjectRepository.create` does add
  the creator as LEAD (first hypothesis disproved). → backlog **UI-13**.

`sprint-drag.spec.ts` failed once and passed on retry — the dnd-kit pointer
timing the config's single retry exists for. Not counted as a pass.

**Skipped:** "Load more appends rather than replacing" skips itself when the
seed fits on one page. It runs against VERUS (7,300 issues) and is skipped
against the demo org (12).

### 8a. The safety net no longer depends on test ordering

`prisma/seed.ts` created a project with **no issues in it**. Every `/issues`
assertion that needs a populated list was therefore passing only because
*other* specs had created issues earlier in the run — a coincidence, not a
safety net, and it broke the moment the specs were run on their own. The seed
now creates 12 demo issues spanning every type, every priority, all four
statuses, assigned and unassigned, overdue and undated. A fresh checkout also
now opens on a populated board and list rather than four empty states.

## 9. Screenshots

Captured after the final build and attached to the review rather than committed
(binaries do not belong in the docs tree): `/issues` at 1920×1080, 1440×900 and
1280×800, plus the Filters panel and the chip row. The 1280 capture is the one
that matters — it is the width at which the previous toolbar lost five
controls.

Reproduce with `node verify.mjs <storageState.json>` against a running build;
the script prints gutter, content width, row height, rows rendered, chrome
height and scroll state at all three widths.
