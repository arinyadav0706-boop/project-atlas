# 06 — `/issues` implementation gate

- **Status:** Revision 2 — awaiting approval. **Stopped here by instruction** —
  no other page has been migrated.
- **Date:** 2026-09-02
- **Covers:** Phase 0 (regression safety), dependency decision, design tokens,
  layout primitives, and the `/issues` rebuild.
- **Revision 2 adds:** the typography increase (§1a), real pagination (§3),
  the server-side pagination finding (§3a), the virtualization reassessment
  (§3b), the full-bleed rule (§6a) and the V1/V2 strategy (ADR-0055).

---

## 1. Headline: the numbers moved, and two unrelated defects fell out

Measured on the same machine, same seed, same browser as the audit.

| Metric | Before | After | |
|---|---|---|---|
| Dead gutter each side @1920 | **168px** | **0** | ✅ |
| Usable content width @1920 | 1280px | **1680px** | **+400px** |
| Row height | 44–45px | **36px** | ✅ |
| Body text | 13–14px, nine ad-hoc sizes | **14px, five roles** | §1a |
| Rows visible @1080 | ~15 | **~23** | **+53%** |
| Document scroll @1080 | 2567px | **1080px** | no document scroll |
| Chrome above first row | n/a (2 filter rows, wrapped) | **180px** | one toolbar row |
| Dead space below the table | n/a | **0** | was 56px, §1b |
| Content width @1440 / @1280 | 1136 / 1136 | **1200 / 1040** | full-bleed |

Chrome breaks down as: top bar 56 + page header 44 + toolbar 44 + column
header 36. The 56px top bar is the **only** part still on the old shell; it
drops to 48 when the global flip happens after this gate.

Measured against the VERUS demo org (7,300 issues across four projects), not
the 30-issue demo project — a dense table is only honestly measured on dense
data.

### 1a. Typography: density from spacing, not from shrinking text

The first scale bought density the cheap way — 13px body, 11px metadata — and
the screenshot read as *small*, not as dense. Revised, with the room bought
back from layout instead:

| Role | Was | Now | Where |
|---|---|---|---|
| Page title | 20px/600 | **21px/600** | `Issues` |
| Section title | 15px/600 | **16px/600** | panel and card headings |
| Body — and primary table text | 13px | **14px** | issue title, issue key, chips, filter labels |
| Metadata — secondary table text | 11px | **12px** | status name, due date, relative time, row counts |
| Column label | 12px/500 | **12px/500** | table headers (unchanged) |
| Micro | — | **11px** | avatar initials only |
| Row height | 32px | **36px** | compact table row |

11px now exists as one named role, `micro`, and has exactly one use. The
`text-[10px]` avatar fallback — below the audit's own stated legibility floor,
and shipped by me in revision 1 — is gone.

The cost is honest and small: **23 rows visible at 1080 instead of 28.** Still
+53% against the 15 the audit measured, and every one of them readable.

### 1b. 56px of dead space under the table

`AppFrame` cancels the shell's `py-7` with a negative margin but was sized
`h-full` — and `h-full` measures the content box, which that padding has
already shortened by 28px top and bottom. The frame therefore ended 56px above
the viewport floor, which was invisible while the table simply scrolled and
became obvious the moment a pagination bar was pinned to the bottom of it.
Fixed with `h-[calc(100%+3.5rem)]`, which disappears along with the padding at
the global flip. Measured before: 56px. After: 0.

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

## 3. Pagination, not "Load more"

An operational dataset is not a feed. The questions a person brings to a list
of issues are *where am I*, *how many are there* and *take me back to where I
was*, and an append-only button answers none of them — it also grows the DOM
without bound and loses your place on every reload.

`/issues` now ends in a real pagination bar, pinned below the scroller so it
does not move as you page:

```
Rows per page [50 ▾]   1–50                              ‹  Page 1  ›
```

Shipped and verified against 7,300 issues:

| Requirement | State |
|---|---|
| Previous / Next | ✅ real buttons, `aria-label`led |
| Disabled states | ✅ Previous disabled on page 1, Next disabled on the last page — **disabled, not hidden**, so the bar does not change shape at the edges |
| Current page | ✅ |
| Row range | ✅ `1–50`, `51–100`, and the short last page |
| Rows-per-page selector | ✅ 25 / 50 / 100, wired to the API's existing `take` |
| Pagination state in the URL | ⚠️ **page size yes** (`?take=25`), **page position no** — see §3a |
| Total result count | ❌ **not available** — see §3a |
| Numbered page list (1 2 3 … 146) | ❌ **not available** — see §3a |
| Selection cleared on page change | ✅ already the behaviour; ids you cannot see must not stay ticked |
| Filter/sort change returns to page 1 | ✅ structurally — see below |

**Returning to page 1 is enforced by construction, not by memory.** Staying on
page 4 of a filter you just replaced shows rows 151–200 of a different result
set — the classic table bug. Rather than calling a reset at each of the six
places that change the question, `setFilter`/`setSort` are wrapped in
`applyFilter`/`applySort` and nothing calls the setters directly. The seventh
call site is the one that would have shipped the bug.

Verified in the browser, with the numbers each step produced:

| Step | Range | Page | URL |
|---|---|---|---|
| Open | `1–50` | 1 | `/issues` |
| Next | `51–100` | 2 | unchanged (see §3a) |
| Previous | `1–50` | 1 | — first row identical to the opening row |
| Sort by Priority | `1–50` | 1 | `?sort=PRIORITY_ASC` |
| Filter Type=Bug, Priority=High | `1–50` | 1 | `?type=BUG&priority=HIGH&sort=PRIORITY_ASC` |
| Remove the Type chip | `1–50` | 1 | `?priority=HIGH&sort=PRIORITY_ASC` |
| Rows per page → 25 | `1–25` | 1 | `…&take=25` |

### 3a. Server-side pagination: what exists, and what does not

I inspected the data path before changing anything: `src/app/api/issues/route.ts`
→ `SavedViewService.queryIssues` → `SavedViewRepository.listIssues`.

| Capability | Present? | Where |
|---|---|---|
| `limit` (as `take`) | ✅ | route → service, clamped to `MAX_PAGE_SIZE` = 100 |
| Cursor pagination | ✅ | keyset on `id`; the repository fetches `take + 1` so "is there more" costs no extra query |
| `offset` / `skip` | ❌ | nothing in the stack accepts one |
| `page` / `pageSize` | ❌ | no page-number addressing anywhere |
| `totalCount` | ❌ | **no `count()` is issued by any query on this path** |

So: **server-side pagination already exists, and the UI is built on it.** What
does *not* exist is the count and the offset addressing that "1–50 of 7,300"
and a numbered page list require. Those are a data/API change, and per the
brief I have not made one.

**I did not fake it.** Counting 7,300 rows in the browser to render a
denominator would mean fetching all 7,300 — pagination-shaped theatre with
worse performance than no pagination at all. The bar therefore shows `1–50`
with no denominator rather than a guessed one, and states the page rather than
offering page numbers that cannot be jumped to. The `Pagination` component
**already renders the full control** — range, denominator, ellipsis window,
clickable numbers, all unit-tested; the only thing standing between the two
modes is a `total` prop that is currently `null`.

#### The safest option, if you want the count

**Additive, ~15 lines, no schema change, no breaking change:**

1. `SavedViewRepository.countIssues(projectIds, filter, customFields)` — a
   `prisma.issue.count()` reusing the **same** `issueFilterWhere(...)` the list
   query already builds, so the count can never disagree with the rows.
2. `queryIssues` runs it in a `Promise.all` with the list query and adds
   `totalCount: number` to `IssueQueryResultDto`.
3. The component passes `total={result.totalCount}`. The numbered control turns
   on by itself.

Cost and risk, honestly:

- **One extra query per page load.** `COUNT(*)` over a filtered set is a
  bitmap-index scan; at 7,300 rows it is sub-millisecond. It becomes a real
  cost at the hundreds-of-thousands mark, where the standard mitigation is a
  capped count (`LIMIT 10001` → "10,000+"), which is what Jira and GitHub both
  do and is worth adopting at the same time.
- **Existing consumers are unaffected** — an added response field breaks
  nothing, and `/api/v1` (ADR-0052) is a separate surface that is not touched.
- **Jump-to-page still needs offset addressing** on top of the count. That one
  is a genuine trade: `OFFSET 7000` scans 7,000 rows before returning any, so
  deep pages get slower, while keyset stays flat. My recommendation is to add
  the **count** (cheap, high value) and keep **keyset** navigation, i.e. keep
  Previous/Next with a real "of 7,300", and only add offset if someone actually
  asks to jump to page 73.

Both are backend changes and both are your call. Say the word and they are a
small, testable commit.

### 3b. Virtualization, reassessed — and dropped

I proposed `@tanstack/react-virtual` in the audit on the strength of "the
dataset can contain thousands of issues". With a 50-row page that argument is
gone, so I measured instead of re-asserting. Chromium, 1920×1080, VERUS data,
click-to-painted-frame:

| Rows per page | DOM nodes on the page | Page-turn to painted frame |
|---|---|---|
| 25 | 836 | 76–86 ms |
| **50 (default)** | **1,517** | **102–120 ms** |
| 100 (max) | 2,777 | 158–190 ms |

Those timings include the API round trip. **Is virtualization still needed?
No.** What would it measurably buy? At 50 rows, nothing — the render is not
where the time goes, and windowing 50 rows means adding a scroll listener,
absolute positioning and a measurement cache to avoid work that costs under a
frame today. Does pagination make it unnecessary? **Yes** — that is exactly
what a bounded page size is for.

The trigger stays named in `05_Dependency_Review.md`: a list that renders
**more than 500 rows in one DOM**. With the page capped at 100 by
`MAX_PAGE_SIZE`, `/issues` cannot reach it. The backlog page, which renders a
whole sprint's worth of cards unpaginated, still can — and that is where the
question should be re-asked, with a measurement, not here.

## 4. Dependencies: none installed

Full reasoning in `05_Dependency_Review.md`. Summary: all five proposals
deferred, each with a named trigger. `/issues` is built entirely on what was
already in `package.json`.

Two corrections to the audit are recorded there: the "~37 kB" figure was
recalled rather than measured and was wrong in composition, and the claim that
no E2E suite existed was simply false — there were 14 specs and 26 tests.

**Bundle delta: 0 kB of new dependencies.** Baseline for future comparison:
725 kB gzipped across all client chunks.

## 5. What changed, and what deliberately did not

**Presentation only.** Every hook, handler and effect in `IssueWorkspace` is
byte-identical: the request-race guard, URL mirroring via `replaceState`,
cursor pagination, shift-click range selection, the single-project bulk-status
rule, `applyBulk`'s per-failure toasts, saved-view dirty detection, and the
`projectsInScope === 0` empty-state distinction (BR-3).

| Preserved | Where it moved |
|---|---|
| Search | Stays inline in the toolbar |
| 6 filter facets + "Assigned to me" | Wrapped two rows → a **Filters panel**, with a chip per active facet (§5a) |
| Clear | Toolbar, beside the chips; "Clear all" also in the panel |
| Saved views: select, clear, delete | 15rem left rail → toolbar `ViewSwitcher` |
| Selection + bulk action bar | Unchanged logic; count strip now appears only when something is selected |
| Load more | **Replaced** by a real pagination bar below the table (§3) — the one place a control was changed rather than moved |
| Custom-field predicates | Toolbar → the Filters panel |
| Corrupt-filter warning | Full-width strip under the toolbar |

### 5a. The correction the screenshots forced

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

## 6. New shared primitives — nothing page-specific

- `shared/components/layout/app-frame.tsx` — `AppFrame`, `WorkspaceHeader`,
  `Toolbar`, `Workspace`
- `shared/components/data/data-table.tsx` — `DataTable` with a typed column
  model (`id`, `header`, `width`, `align`, `sortKey`, `cell`, `hideBelow`)
- `shared/components/data/pagination.tsx` — `Pagination`, with both modes
  (range-only and fully numbered) already built
- `shared/lib/pagination.ts` — `pageWindow` and `PAGE_SIZE_OPTIONS`, pure and
  unit-tested. Pure logic sits outside the `"use client"` module for a reason
  that cost a 500 in this session: a Server Component importing a value from a
  client module gets a client-reference proxy, so `PAGE_SIZE_OPTIONS.includes`
  threw at request time — past typecheck, past lint, past build.
- `features/saved-views/components/issue-columns.tsx` — the column definitions
- `features/saved-views/components/view-switcher.tsx`

`DataTable`'s API is deliberately the one a table library would need, so
adopting TanStack later replaces the internals of one file and no consumer
changes.

## 7. Tokens, and the guard that makes them stick

Additive only — no existing token renamed or re-valued, so the 31 unmigrated
pages render identically. Added: `primary` (+ foreground), `surface-sunken`,
`surface-raised`, `border-subtle`, `border-strong`, `info`, `focus-ring`,
`input`, `popover`; a **six-role type scale** (`page-title`, `section`, `body`,
`label`, `meta`, `micro` — re-valued upward in revision 2, see §1a); three radii
(`chip`/`control`/`panel` at 4/6/8px) under **new names**, because re-valuing
`rounded-2xl` would restyle every panel in one commit; and named control
heights, of which `row-compact` moved 32px → 36px.

Re-valuing the type tokens was safe precisely because they are new: `text-body`,
`text-meta` and the rest are used in six files, all of them part of this
migration. The 31 unmigrated pages still use the old ad-hoc sizes and did not
move a pixel.

**UX-2 guard shipped** (`src/tests/design-tokens.test.ts`): every colour-like
utility in `src/` must name a colour the theme defines. On its first run it
found **two more shipped instances of the same bug** — `border-input` on the
epic select (no border rendered) and `bg-popover` on the comment composer (no
background). Both were invisible to typecheck, lint and build.

## 8. Full-bleed, and what it does not mean

Full-bleed is about the **data surface**, not about every control. Stretching a
search box to 1,680px is the same mistake as a 168px gutter, pointing the other
way. The rule now applied on `/issues`, and the one the other nine pages will
inherit:

| Element | Width | Why |
|---|---|---|
| Table | full available | the data is the point; more columns and longer titles are real gains |
| Toolbar | full available | it is a bar, and it holds a right-aligned trailing slot |
| Search input | **224px fixed** | a title search is a few words; a 1,600px input is a target, not a field |
| Filters button, chips | intrinsic | sized by content, never stretched |
| Filter panel | **512px** centred dialog | seven labelled controls read as a form, and a form has a comfortable measure |
| Pagination bar | full width, content at both edges | rows-per-page left, navigation right |
| Forms / settings / profile | `max-w-4xl` centred (`measure="regular"`) | reading width, as approved |

`AppFrame` carries this as `measure`: `full` for data surfaces, `regular` for
prose and forms. It is a declared choice per page, not a default that every
screen inherits by accident.

**One deliberate acceptance.** At 1920 the title column takes the slack, which
leaves visible space between a short title and the Status column. The
alternative — capping the title and letting the metadata float mid-screen with
empty space to its right — is worse, and it is why Linear and Jira both let the
title flex. If it still reads as empty after you have used it, the right fix is
to *spend* that width on information (assignee names beside avatars, a labels
column), not to shrink the table back down.

## 9. Known gaps, stated plainly

- **The top bar is still 56px** and the global `<main>` padding is unchanged;
  `AppFrame` cancels it with negative margins for this page only. That is
  deliberate for the island phase and is removed by the global flip.
- **No total count, and no jump-to-page.** The two pieces of the pagination
  control that need a backend change; §3a has the measurement, the cost and the
  recommendation. Not done unilaterally.
- **Page position is not in the URL.** A shared link reopens the same filtered,
  sorted list at page 1. A cursor is an opaque row id, not an ordinal, so
  `?page=3` cannot be resolved without walking pages 1 and 2 — offset
  addressing is what would fix it.
- **No virtualization**, and now with a measurement behind that (§3b) rather
  than an assumption.
- **Density is not user-selectable.** One good default, as instructed.
- **`/issues` is the only migrated page.** Nine remain.

## 10. Regression evidence

Recorded at gate time, in this order, on a database re-seeded from scratch
(`prisma:seed` + `seed:verus`) because the integration suite truncates it.

| Check | Result |
|---|---|
| Unit (`npm test`) | **1228 passed**, 84 files, 8.4s |
| Integration (`npm run test:integration`) | **355 passed**, 31 files, 80s |
| E2E (`npx playwright test`) | **39 passed, 2 failed**, no flakes, no skips, 3.4 min |
| `/issues` + shell specs on their own | **14 passed**, no skips |
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

**Nothing skipped, nothing flaky in this run.** The previous run's one skip was
"Load more appends rather than replacing", which skipped itself whenever the
seed fitted on one page — which was always, in the demo org. It has been
replaced by three pagination specs that open the list at `?take=25` against a
30-issue seed, so two pages are guaranteed and the tests actually run:

- paging forward and back **replaces** the rows and moves the range
- changing the page size re-pages from the top and puts `take=25` in the URL
- a filter change returns to page one

### 10a. The safety net no longer depends on test ordering

`prisma/seed.ts` created a project with **no issues in it**. Every `/issues`
assertion that needs a populated list was therefore passing only because
*other* specs had created issues earlier in the run — a coincidence, not a
safety net, and it broke the moment the specs were run on their own. The seed
now creates 12 demo issues spanning every type, every priority, all four
statuses, assigned and unassigned, overdue and undated. Raised to **30** in
revision 2 so `?take=25` yields two pages and the pagination specs cannot skip
themselves. A fresh checkout also now opens on a populated board and list
rather than four empty states.

## 11. Screenshots

Captured after the final build and attached to the review rather than committed
(binaries do not belong in the docs tree): `/issues` at 1920×1080, 1440×900 and
1280×800, plus the Filters panel and the chip row. The 1280 capture is the one
that matters — it is the width at which the previous toolbar lost five
controls.

Captured: `/issues` at 1920×1080 and 1280×800; the Filters panel; the toolbar
with two active chips; page 2 of the list.

Reproduce with `node verify.mjs <storageState.json>` against a running build;
the script prints gutter, content width, row height, rows rendered, chrome
height, scroll state and the gap below the pagination bar at all three widths.

## 12. V1 / V2 during the migration

**ADR-0055** (proposed, no branches created): one repository, trunk-based,
short-lived per-page branches, and a `FEATURE_UI_V2` flag in the existing
`feature_flags` table that selects which presentation renders. `main` stays V1
by default and therefore stays deployable at every commit; V2 is new component
files beside the old ones; the service layer, repositories, schema, API routes
and permissions are **shared and never forked**, so a backend fix is one commit
that both UIs get with nothing to port.

It explicitly rejects a second repository, a long-lived `feature/ui-v2` branch
and a `release/v1` maintenance branch, and says under what condition each of
those would become the right answer instead. CI changes in exactly one way: a
migrated page's E2E specs run twice, flag-off and flag-on — affordable only
because Phase 0's specs assert on roles and visible text rather than DOM
structure. Cutover deletes the legacy components and the flag; a flag that
survives its cutover is a permanent fork with a friendly name.
