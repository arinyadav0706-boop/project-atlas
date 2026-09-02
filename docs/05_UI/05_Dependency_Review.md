# 05 — UI modernization: final dependency review

- **Status:** Decided — **no dependency is being installed for this phase.**
- **Date:** 2026-08-27
- **Supersedes:** the "five additions, ~37 kB gzipped" line in
  `04_Modernization_Audit.md` §C, which was estimated rather than measured and
  was wrong in both figure and composition.

---

## 1. Two corrections to the audit before anything else

**1a. The `~37 kB` figure was not measured.** It was recalled. Measured against
the real registry tarballs it is wrong, and wrong in a way that matters: the
packages' own code is *smaller* than claimed, but the transitive trees are far
bigger.

| Package | Own code, gz | With transitive tree | npm packages pulled |
|---|---|---|---|
| `@tanstack/react-table` | 6 kB | 97 kB (all builds) | 5 |
| `@tanstack/react-virtual` | 1 kB | 11 kB | 4 |
| `@radix-ui/react-tabs` | 2 kB | 17 kB | 4 |
| `@radix-ui/react-scroll-area` | 6 kB | 17 kB | 4 |
| `@radix-ui/react-popover` | 3 kB | **117 kB** | **14** |

**On the units, precisely:** the middle column is every `.js` in the installed
tree concatenated and gzipped at level 9. That **double-counts** CJS, ESM and
development builds, and it **ignores** that several Radix sub-packages
(`react-portal`, `react-focus-scope`, `react-dismissable-layer`,
`react-presence`, `react-popper`, `react-primitive`) are **already in this
project** via `dialog`, `select` and `dropdown-menu` — so the marginal cost of
`react-popover` here is a fraction of 117 kB. It is therefore a **worst-case
upper bound before tree-shaking and before deduplication**, not a bundle delta.

**The only honest number is the build delta.** Baseline recorded today, to be
compared after `/issues` ships:

```
all client chunks, gzipped, before any change:  725 kB
```

**1b. The audit said "Playwright is installed but there is no end-to-end
suite." That is false.** There are **14 spec files and 26 tests** in `e2e/`,
covering auth, RBAC, issue create, comments, attachments, epics, sprint
drag-and-drop, backlog grouping, search, notifications, profile, reports and
admin. Phase 0 is consequently a gap-fill, not a build-out. §4 lists the four
gaps that actually matter for this refactor.

---

## 2. What `/issues` actually is

The recommendation below only makes sense against the real page, so:
`/issues` renders a **cursor-paginated list of 50 rows with "Load more"** —
`<ul>` of `CrossProjectRow`, not a column table. Sorting is **server-side**
(a `sort` parameter). Filtering uses Radix `Select` controls. Selection is a
`Set<string>` with a bulk action bar. Saved views live in a rail.

---

## 3. Final dependency table

| Library | Exact purpose | Existing alternative | Why it is **not** needed now | Bundle impact | Used on | Decision |
|---|---|---|---|---|---|---|
| `@tanstack/react-table` | Column model: sizing, ordering, pinning, visibility, sort state | A typed column-definition array (~80 lines) plus CSS Grid. Sorting is already server-side, so the library would run in `manualSorting` mode as a state container. Row selection already works with a `Set` | Resize / reorder / pin are **new features**, not part of a UI refactor. Adopting the library now buys indirection, not capability | ≤97 kB worst case; ~15–20 kB realistic | Would be `DataTable` | **Defer** |
| `@tanstack/react-virtual` | Windowing long lists | None needed — the page renders **one page of 50**, capped at 100 by `MAX_PAGE_SIZE` | **Re-measured at the gate, not re-asserted:** 1,517 DOM nodes and a 102–120 ms click-to-paint page turn at 50 rows (158–190 ms at 100), API round trip included. Windowing 50 rows adds a scroll listener, absolute positioning and a measurement cache to save work that costs under a frame. Real pagination removed the premise the audit's proposal rested on | 11 kB worst case | `/issues`, backlog | **Defer — and the reason is now measured** |
| `@radix-ui/react-tabs` | Accessible in-page tabs with roving focus | `TabNav` (route tabs) — correct for routes | `/issues` has **no in-object tabs**. The saved-view rail is a list of links | 17 kB worst case | Nothing yet | **Defer** |
| `@radix-ui/react-scroll-area` | Overlay scrollbars in nested panels | Native `overflow: auto` | Native scrollbars are correct on macOS and Linux, which is all I can actually test here. Claiming a Windows fix I cannot verify would be a guess | 17 kB worst case | Table body | **Defer** |
| `@radix-ui/react-popover` | Form controls in a floating container | Radix `Select` for each facet (already used); `Dialog` for anything larger | The compact toolbar fits the existing Selects in one row. A multi-select filter with search would need this — but that is **new functionality**, not a layout change | ≤117 kB standalone; far less here (most sub-packages already present) | Filter overflow | **Defer** |

### Installed for this phase: **none of the five.** Re-confirmed at the gate.

Nothing in the /issues gate changed a deferral. The pagination bar, the filter
panel and the chips are Radix `Select` and `Dialog` (already present), CSS Grid
and Tailwind. The one proposal whose *justification* changed is
`react-virtual`, and it changed against adoption — see the table row above.

`/issues` will be rebuilt entirely on what is already in `package.json`:
Tailwind for layout and density, CSS Grid for the table, Radix `Select` and
`Checkbox` for controls, `cva` for variants, Lucide for icons, and the existing
server-side sort and cursor pagination.

The `@radix-ui/react-popover` row deserves a note after the fact: the toolbar
overflow it was proposed for turned out to be real, and was solved with the
`Dialog` already in the tree rather than by installing the popover. A modal
filter panel is a slightly heavier interaction than a popover; it is also 0 kB
and 0 new packages. The trigger stands — multi-select filters with search.

### The triggers that would change each answer

Each deferral has a named condition, so this is a decision with an expiry, not
an omission:

| Library | Adopt when |
|---|---|
| `react-table` | Column resize/reorder/pinning is approved as a **feature**, or the third page needs a column behaviour the hand-rolled model cannot express |
| `react-virtual` | A list renders **>500 rows in one DOM**. `/issues` cannot reach it — the page size is capped at 100. The **backlog**, which renders a whole sprint unpaginated, still can; re-ask there, with a measurement |
| `react-tabs` | The issue-detail split view lands and needs in-object tabs |
| `react-scroll-area` | A Windows user reports the scrollbar, or we get a Windows test target |
| `react-popover` | Multi-select filters with search are approved as a feature |

### Why this is the right call rather than the lazy one

`DataTable` is designed with the **component API a library would need**: column
definitions with `id`, `header`, `width`, `align`, `cell`, plus `sort` and
`onSortChange`. If TanStack Table is adopted later, it replaces the internals
of one file. No page that consumes `DataTable` changes.

The honest cost of deferring: the hand-rolled column model is ~80 lines that
must be maintained. The honest cost of adopting: a dependency, its transitive
tree, and a migration on all six tables at once rather than one at a time. For
a refactor whose first rule is "do not break working functionality", the
smaller surface wins.

---

## 4. Phase 0, rescoped against what already exists

**Already covered** (26 tests): sign-in for LEAD / VIEWER / ADMIN · RBAC on the
admin console and the Users tab · VIEWER sees no create control · issue create ·
comments · attachments · labels and components · story points · epic hierarchy ·
sprint drag-and-drop · backlog grouping and collapse · bulk move to sprint ·
search palette and ⌘K · notifications · profile · reports.

**The four gaps that matter for a shell-and-`/issues` refactor:**

| # | Gap | Why it matters here |
|---|---|---|
| 1 | **`/issues` cross-project workspace** — filters, saved views, sort, bulk actions, Load more | The page being rebuilt has no E2E coverage of its own behaviour |
| 2 | **Navigation smoke across every top-level route** | A shell change is exactly what breaks a route silently |
| 3 | **Deep link with filter params in the URL** | The filter is parsed server-side from `searchParams`; a layout change must not disturb it |
| 4 | **Browser back / forward** | The workspace pushes filter state into the URL |

Four specs. Not a testing project.
