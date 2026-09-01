# 04 — UI/UX Modernization Audit

- **Status:** Proposed — awaiting approval. **No implementation has started.**
- **Date:** 2026-08-27
- **Scope:** Presentation layer only. No API, schema, service, permission or
  business-logic change.
- **Measured against:** the running application at 1920×1080 and 1440×900,
  seeded with VERUS demo data (~150 users, ~8k issues).

Every number in this document was measured in a browser, not estimated from
source. The measurement script is reproducible from §K.

---

## A. Executive summary

The UI is not badly built. It is **built to the wrong width and the wrong
density**, and the design system that would have prevented the drift exists but
is bypassed by 31 of 32 pages.

Five findings, in priority order:

**A1 — The application throws away a third of a large screen.**
At 1920×1080 the main region is 1680px wide. Content is capped at 1152–1280px
and centred, leaving **168–232px of dead gutter on each side** — 336–464px
unused. At 1440×900 the gutter is zero. The layout was evidently built and
reviewed at 1440; on the monitors an enterprise tool is actually used on, it
looks like a mockup floating in the middle of the screen. This single fact
accounts for most of "excessive whitespace on the left and right".

**A2 — Two content widths, so the page frame jumps when you navigate.**
`/home` renders at 1152px, `/issues` at 1280px. Moving between them shifts the
content column **64px sideways**. `PageShell` was written to fix exactly this —
its own source comment says so — and then **31 of 32 pages did not adopt it**.
The system exists; the adoption did not happen.

**A3 — 22% of vertical space is spent before the workspace begins.**
On the project board at 1080p, **239px** of top bar, back-link, page header,
subtitle and tabs sit above the first column. The board gets 78% of the screen
it should get.

**A4 — Rows are cards inside cards.**
On Home, each of the 10 "My work" items is its own bordered, rounded, padded
surface **inside** the panel that already has a border and a radius. Ten items
consume ~630px where a list would use ~320px. The nesting is real and
measurable: `maxCardNesting: 1` on `/home` and `/dashboards`.

**A5 — The radius and spacing scales are not scales.**
Six radius values in use (`rounded-2xl` = 20px is the default panel), nine
vertical-rhythm values, eighteen padding values. Nothing enforces a choice, so
each component picked its own.

**None of this requires touching a service, a route, an API or the database.**
It is layout, tokens and three shared components. The risk is concentrated in
one place — the app shell — and the mitigation is to change the shell once,
behind a flag, and verify before propagating.

---

## B. Existing codebase architecture

### B1. Stack

| Layer | What is there | Version |
|---|---|---|
| Framework | Next.js App Router, Turbopack, RSC | 16.3.0 |
| UI runtime | React | 19.2.8 |
| Language | TypeScript, strict, no `any` | 5.6 |
| Styling | Tailwind CSS + `tailwind-merge` + `clsx` + `cva` | 3.4.11 |
| Primitives | Radix (`avatar`, `checkbox`, `dialog`, `dropdown-menu`, `select`, `slot`, `tooltip`) | 1.x–2.x |
| Icons | `lucide-react`, used consistently | 0.446 |
| Charts | ECharts, reading CSS tokens at runtime | 6.1 |
| Drag & drop | `@dnd-kit` core + sortable + utilities | 6.3 |
| Forms | `react-hook-form` + `zod` via `@hookform/resolvers` | 7.53 / 3.23 |
| Toasts | `sonner` | 1.5 |
| Motion | `framer-motion` | 11.5 |
| Auth | NextAuth v5 beta | 5.0.0-beta.32 |
| Data | Prisma → Postgres, repository pattern | 5.22 |
| Ordering | `fractional-indexing` for rank | 3.4 |

**This is already the stack the brief asks for.** Radix + Tailwind + `cva` +
Lucide + dnd-kit is the shadcn/ui pattern, implemented directly rather than via
the CLI. There is no framework migration to do, and no reason to introduce one.

### B2. Shell

```
src/app/layout.tsx                     fonts, providers, <html>
src/app/(app)/layout.tsx               auth gate → Sidebar + TopBar + <main>
src/app/(app)/admin/layout.tsx         PageShell + TabNav
src/app/(app)/projects/[id]/layout.tsx PageShell(wide) + back link + PageHeader + ProjectTabs
```

Measured constants:

| Element | Value | Verdict |
|---|---|---|
| Sidebar | `w-60` = 240px (`w-14` = 56px below `md`) | Reasonable; ClickUp ~240, Linear ~220 |
| Top bar | `h-14` = 56px | Slightly tall; 48px is the modern norm |
| `<main>` padding | `px-8 py-7` = 32 / 28px | Too generous at the outer edge |
| `PageShell` | `max-w-7xl` (1280) / `max-w-6xl` (1152), `mx-auto` | **The cause of A1 and A2** |
| Card | `rounded-2xl` (20px) + border + `shadow-card` | Radius too large for a dense app |
| CardHeader / Content | `px-5 pb-3 pt-4` / `px-5 pb-5` | ~20px internal padding everywhere |

### B3. Shared component inventory

`src/shared/components/ui/` — 19 components: `avatar`, `badge`, `button`,
`card`, `checkbox`, `dialog`, `dropdown-menu`, `empty-state`, `input`, `label`,
`page-header`, `page-shell`, `select`, `skeleton`, `stat-tile`, `switch`,
`tab-nav`, `textarea`, `tooltip`.

`src/shared/components/app-shell/` — `sidebar`, `top-bar`.

This is a **good foundation that is under-used**, not a missing foundation.
`TabNav`'s source comment records that it was created to merge two divergent
implementations — the same class of problem as `PageShell`, caught earlier.

### B4. What is genuinely missing

| Gap | Consequence today |
|---|---|
| No `Table` primitive | Every table is hand-rolled `<div>`/`<table>`; row heights measured at 38, 44 and 45px on three pages |
| No `Toolbar` primitive | Filter bars are ad-hoc flex rows; on `/issues` they wrap to two lines at 1280px |
| No `Drawer`/side-panel | Contextual detail becomes a full page navigation or a modal |
| No `SplitView` | "Master list + detail" — the core interaction of Linear and Jira — does not exist |
| No density or layout tokens | Every page re-decides its own spacing |

---

## C. Dependency audit

### C1. Already present — reuse, do not replace

Radix, Tailwind, `cva`, `tailwind-merge`, Lucide, dnd-kit, ECharts,
react-hook-form, zod, sonner, framer-motion. **All of it stays.** No
replacement is proposed for any existing dependency.

### C2. Proposed additions

| Library | Purpose | Why existing cannot do it | Risk | Recommendation |
|---|---|---|---|---|
| **`@tanstack/react-table`** (~14 kB gz) | Headless column model: sizing, ordering, pinning, resize, grouping | Tables are bespoke per page; column resize/reorder/pin is the top density gap vs Jira and there is no shared model to add it to | Low — headless, no DOM, no styling opinions. Adopt on **one** table first | **Adopt, phased** |
| **`@tanstack/react-virtual`** (~4 kB gz) | Windowing for the issue list and backlog | `/issues` renders 50 rows today; a real project is 5,000. Nothing here virtualizes | Low — opt-in per list. **Only where a list is unbounded** | **Adopt, only for `/issues` and backlog** |
| **`@radix-ui/react-tabs`** (~5 kB gz) | Accessible in-page tabs with roving focus | `TabNav` is route-based and correct for routes; in-object tabs (issue detail) need `role="tablist"` + arrow keys, which is not what `TabNav` does | Very low — same family already in use | **Adopt** |
| **`@radix-ui/react-scroll-area`** (~6 kB gz) | Consistent overlay scrollbars in panels and boards | Native scrollbars in nested panels are the main "unfinished" visual tell on Windows | Very low | **Adopt** |
| **`@radix-ui/react-popover`** (~8 kB gz) | Filter popovers in the toolbar | `dropdown-menu` is a menu, not a form container; putting inputs in it is an accessibility misuse | Very low | **Adopt** |

Total added: **~37 kB gzipped**, all tree-shakeable, none replacing anything.

### C3. Explicitly rejected

| Not adopting | Why |
|---|---|
| shadcn/ui CLI | Would overwrite 19 existing components wholesale. The *patterns* are already followed; copying files in is the big-bang this brief forbids |
| A component library (MUI, Mantine, Ant) | Replaces the entire presentation layer. Directly against the brief |
| A CSS-in-JS runtime | Tailwind works and RSC-compatible CSS-in-JS is still a liability |
| `react-grid-layout` for dashboards | 30 kB + jQuery-era API. CSS Grid with a span model already works |
| Replacing ECharts | Charts work and read theme tokens correctly. Zero product value in churning them |
| Replacing dnd-kit | Works, accessible, actively maintained |

---

## D. Global UI problems, with measurements

### D1. Horizontal — the headline problem

At **1920×1080**:

| Route | main width | content width | dead gutter **each side** |
|---|---|---|---|
| `/home` | 1680 | 1152 | **232** |
| `/issues` | 1680 | 1280 | **168** |
| `/projects` | 1680 | 1152 | **232** |
| `/dashboards` | 1680 | 1280 | **168** |
| `/workload` | 1680 | 1280 | **168** |
| `/admin/users` | 1680 | 1152 | **232** |

At **1440×900** every gutter is **0**. The problem is invisible at the width it
was designed at and severe at the width it is used at.

### D2. Vertical

Project board, 1920×1080: **239px above the workspace = 22% of the viewport.**
Composed of top bar 56 + main padding 28 + back link ~36 + page header ~72 +
tabs ~42.

`/issues` scrolls to **2567px** in a 1024px viewport — 2.5 screens for a list
that should paginate inside a fixed frame.

### D3. Cards

`maxCardNesting: 1` on `/home` and `/dashboards` — panels containing bordered
rounded rows. `/workload` renders **13 card surfaces** on one screen.

Home "My work": 10 rows at ~63px each. A flat list at 32px rows shows the same
10 items in half the space, plus 5 more items in the same area.

### D4. Radius and spacing are not scales

```
rounded-xl    83 uses      space-y-4  32     px-3  92
rounded-full  65           space-y-3  19     px-2  61
rounded-2xl   51           space-y-5  13     py-2  60
rounded-lg    38           space-y-2  12     py-0.5 41
rounded-md    34           space-y-1.5 6     px-4  40
rounded-3xl    2           …9 total          …18 total
```

Six radii, nine rhythms, eighteen paddings. Linear ships with essentially two
radii and one 4px spacing scale.

### D5. Typography

Nine distinct font sizes measured on one page (`/home`: 9, 10, 11, 12, 13, 14,
15, 16, 28px). A 9px label is below the accessible floor.

### D6. Control sizing

Button heights measured at **18, 24, 28, 32, 36 and 40px** across four pages.
Input heights at 40px. There is no size scale.

### D7. Design tokens — one real bug already found and fixed

The token set (`--background`, `--surface`, `--canvas`, `--foreground`,
`--border`, `--accent`, `--muted`, `--destructive`, `--success`, `--warning`)
is sound and theme-aware.

But there is **no `--primary` token**, and four components wrote their selected
state as `border-primary` / `bg-primary` / `text-primary`. Tailwind silently
drops unknown utilities, so those selected states rendered **identically to
unselected** — including the API-token scope checkboxes, where a ticked box
showed empty. Fixed on 2026-08-27 (backlog UX-1). The systemic gap — nothing
fails when a component names a token that does not exist — is **UX-2** and is
part of this plan.

---

## E. Proposed EAGLES design system

Additive. Existing tokens keep their names and values; nothing is renamed.

### E1. Spacing — 4px base, seven steps

```
--space-1   4px    icon↔label, chip padding
--space-2   8px    inside a control, between adjacent controls
--space-3  12px    list row padding, compact panel padding
--space-4  16px    default panel padding, between related blocks
--space-5  20px    between sections inside a panel
--space-6  24px    between panels
--space-8  32px    between major page regions (rare)
```

Anything not on this scale becomes a lint error (§J4).

### E2. Density — the new axis

Two modes, chosen per surface, not per page:

| | Comfortable | **Compact** (default for data) |
|---|---|---|
| Table/list row | 40px | **32px** |
| Control height | 32px | **28px** |
| Panel padding | 16px | **12px** |
| Body text | 14px | 13px |

Compact is the default for tables, lists, boards and toolbars. Comfortable for
forms, settings and reading surfaces.

### E3. Typography — six roles, no ninth size

| Role | Size / weight | Use |
|---|---|---|
| `page-title` | 20px / 600 | One per page (down from 26px) |
| `section-title` | 15px / 600 | Panel headers |
| `body` | 13px / 400 | Table cells, list rows |
| `body-strong` | 13px / 500 | Emphasised cell |
| `label` | 12px / 500 | Field labels, column headers |
| `meta` | 11px / 400 | Timestamps, counts, captions |

**9px and 10px are removed.** 11px is the floor.

### E4. Radius — three values

```
--radius-sm   4px   chips, badges, checkboxes
--radius-md   6px   buttons, inputs, menu items
--radius-lg   8px   panels, cards, dialogs
```

`rounded-2xl` (20px) and `rounded-3xl` disappear from panels. `rounded-full`
stays for avatars and pills only.

### E5. Component sizing

```
sidebar          240px (expanded) / 48px (collapsed)
top bar           48px   (from 56)
page header       44px   (from ~92 incl. subtitle)
toolbar           40px
button       sm 24 / md 28 / lg 32
input        sm 28 / md 32
table row    compact 32 / comfortable 40
table header      36px, sticky
```

### E6. Colour — add what is missing, rename nothing

Existing tokens stay. Add:

```
--primary            → alias of --accent, so the four dead classes resolve
--surface-sunken     → toolbar / table-header ground
--surface-raised     → popovers, dialogs
--border-subtle      → inside a panel (rows, cells)
--border-strong      → panel outline
--info               → the fourth semantic tone (have success/warning/destructive)
--focus-ring         → one visible focus colour everywhere
```

---

## F. Proposed application shell

### F1. Target

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP BAR  48px   logo · search · notifications · avatar          │
├──────────┬──────────────────────────────────────────────────────┤
│          │ PAGE HEADER 44px   breadcrumb · title · actions      │
│ SIDEBAR  ├──────────────────────────────────────────────────────┤
│  240px   │ TOOLBAR 40px   view switcher · filters · sort        │
│          ├──────────────────────────────────────────────────────┤
│          │                                                      │
│          │ WORKSPACE  — fills remaining height, scrolls itself   │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### F2. The three changes that do the work

**F2a. Full-bleed by default.** `<main>` drops `max-w-*` and `mx-auto`; padding
goes from `px-8 py-7` (32/28) to `px-4 py-3` (16/12). Recovers **336–464px
horizontally**. A `measure` prop stays available for genuinely prose-width
surfaces (profile, settings forms) — the exception, declared, not the default.

**F2b. The page owns its height.** The workspace becomes
`flex-1 min-h-0 overflow-auto`, so the toolbar and table header stay fixed and
only rows scroll. Removes the 2567px document scroll on `/issues`.

**F2c. Header collapses.** Back-link merges into a breadcrumb; the subtitle
moves to a tooltip on the title or into the toolbar. **239px → ~130px**, giving
the workspace ~110px more (≈3 more table rows, or a visible board card).

### F3. New primitives

| Primitive | Replaces |
|---|---|
| `<AppFrame>` | Ad-hoc `<main>` padding + `PageShell` |
| `<PageHeader compact>` | Current 92px header |
| `<Toolbar>` | Hand-rolled filter rows |
| `<ViewSwitcher>` | Vertically stacked views |
| `<DataTable>` | Six bespoke table implementations |
| `<Drawer>` | Full-page navigation for contextual detail |
| `<SplitView>` | Nothing — new capability |

---

## G. Component migration plan

### Keep untouched (13)
`avatar`, `badge`, `button` (retune sizes only), `checkbox`, `dropdown-menu`,
`input` (retune height), `label`, `select`, `skeleton`, `switch`, `textarea`,
`tooltip`, `LogoMark`.

### Refactor in place — same name, same props, new internals (6)
| Component | Change |
|---|---|
| `Card` | `rounded-2xl` → `rounded-lg`; `p-5` → `p-4`/`p-3`; add `flush` for full-bleed content |
| `PageHeader` | Add `compact`; move subtitle out of the vertical stack |
| `PageShell` | Becomes `AppFrame`; `max-w` opt-in rather than default |
| `TabNav` | Retune to 36px; add `role="tablist"` semantics |
| `StatTile` | Compact density; smaller radius |
| `EmptyState` | Reduce vertical padding ~40% |
| `top-bar` / `sidebar` | 56 → 48px bar; add collapse toggle |

### Replace (behaviour preserved, implementation new) (2)
- **Tables** — six bespoke implementations → one `DataTable` on TanStack Table.
  Migrated **one at a time**, existing markup left in place until each is
  verified.
- **Dialog** — keep Radix, add a `Drawer` variant so contextual detail stops
  requiring a full navigation.

### Delete
Nothing. No component is removed in this plan.

---

## H. Page-by-page plan

Ordered by (density pain × traffic) ÷ risk.

| # | Page | Change | Risk |
|---|---|---|---|
| 1 | `/issues` | Reference implementation: full-bleed, toolbar, `DataTable`, virtualization, drawer detail | **Medium** — most complex; deliberately first so the system is proven under load |
| 2 | `/projects/[id]/board` | Full-height columns, compact cards, sticky header. **dnd-kit untouched** | Medium — DnD regression risk; E2E first |
| 3 | `/home` | Flatten nested row-cards to lists; 2-column grid | Low |
| 4 | `/projects/[id]/backlog` | Same table + sprint panel; virtualization | Medium |
| 5 | `/dashboards` | 12-column responsive grid; widget chrome to 8px radius | Low — widget data untouched |
| 6 | `/workload` | 13 cards → dense table + summary strip | Low |
| 7 | `/projects/[id]/issues` | Reuse `DataTable` | Low |
| 8 | `/admin/*` | Consistent tables, compact forms | Low |
| 9 | Issue detail | Split view; sidebar to a rail | Medium |
| 10 | Timeline / calendar | Density + chrome only; **layout maths untouched** | Low |

Phases 1–3 land the system. 4–10 apply it.

---

## I. Dashboard architecture

Current: `lg:grid-cols-3` with `SMALL`/`MEDIUM`/`LARGE` → `col-span-1/2/3`.
That is already a grid, not a stack — the problem is **chrome**, not structure.

Proposed: widen to a **12-column** grid (`col-span-3/4/6/12`) so half-width and
third-width widgets both exist; reduce widget padding 20 → 12px and radius 20 →
8px; move edit affordances into a hover toolbar instead of permanent chrome.

**Widget data contracts, the widget dialog, and all persisted layout values are
unchanged.** `SMALL`/`MEDIUM`/`LARGE` remain the stored values and map to the
new spans.

---

## J. Regression safety plan

### J1. What already protects us

- **1,220 unit + 355 integration tests, all green.** None assert on class
  names, so they will not break for cosmetic reasons — and they will catch a
  service or permission regression immediately.
- **Playwright is installed and configured.**
- Business logic lives in services; components call `apiRequest`. A layout
  change cannot reach a service.

### J2. What must be built before Phase 3

**An E2E regression suite is the precondition for touching the shell.** Today
there is no automated proof that a route still works after a layout change.
Minimum set, one spec per flow:

- auth: sign in, sign out, deep link while signed out → redirect → land
- navigation: every top-level route, back/forward, deep link to an issue
- issues: create, edit inline, filter, search, sort, bulk select, save a view
- board: drag a card between columns, verify persistence after reload
- permissions: MEMBER cannot see Admin; ADMIN can — run as both
- forms: validation error, submit, server error surfaced
- drawer/modal: focus trap, Escape, focus returns to trigger

### J3. Per-phase gate

After every phase, all must pass:

```
npm run typecheck && npm run lint
npx vitest run                 (1220 unit)
npm run test:integration       (355 integration)
npm run test:e2e               (new suite)
npm run build
```

Plus a manual pass at **1920×1080, 1440×900 and 1280×800**, in light and dark.

### J4. Guardrails that make the system stick

The reason a design system existed and was bypassed is that nothing enforced
it. Three lint rules, added in Phase 2:

1. **Colour utilities restricted to defined tokens** — closes UX-2; `bg-primary`
   with no `--primary` would have failed at write time.
2. **Spacing/radius restricted to the scale** — no `p-[13px]`, no `rounded-3xl`.
3. **`max-w-*` and `mx-auto` banned outside `AppFrame`** — makes A1/A2
   structurally impossible to reintroduce.

### J5. Rollback

Each phase is one commit on a branch off `main`, reviewed and pushed
separately. The shell change (Phase 3) ships behind a **feature flag** using the
existing flag platform (ADR-0023), so the old shell is one toggle away for as
long as needed. No migration, no data change — rollback is `git revert`.

### J6. Explicitly out of scope

No change to: routes, API contracts, Prisma schema, migrations, services,
repositories, RBAC, auth, feature flags, validation schemas, ECharts data
transforms, dnd-kit ordering, or `fractional-indexing` rank maths.

---

## K. Reproducing the measurements

```
npm run dev
# Playwright at /opt/pw-browsers/chromium, NO_PROXY='*'
# sign in, then for each route read:
#   main.getBoundingClientRect().width
#   main.children[0].getBoundingClientRect().width
#   getComputedStyle(main).padding*
#   nested count of [class*="rounded-2xl"], [class*="shadow-card"]
```

Screenshots taken 2026-08-27 at 1920×1080: `/home`, `/issues`, `/workload`,
`/projects`, `/projects/[id]/board`.

---

## L. What this plan does **not** claim

- It does not claim the app will look like ClickUp. It will have ClickUp's
  **density and layout discipline** with EAGLES' own identity — the brief's own
  instruction.
- It does not claim zero visual regression. Every page will look different;
  that is the point. **Functional** regression is what §J protects.
- Phase 1 is the riskiest page on purpose. If the system does not survive
  `/issues`, it is better to learn that in week one than in week six.
