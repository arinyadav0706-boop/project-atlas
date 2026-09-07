# 07 — V2 migration plan

- **Status:** In progress. `/issues` and the **Board** are done; the project
  shell came with the board. `/issues` remains the reference
  (`06_Issues_Gate_Report.md`).
- **Date:** 2026-09-03 (order revised)
- **Strategy:** ADR-0055 — one repository, trunk-based, `FEATURE_UI_V2` selects
  the presentation. Nothing below touches a service, a repository, the schema,
  an API contract or a permission.

---

## 1. How the order was chosen

Not by how bad each page looks. By **what a migration teaches the next one**,
and by **what it can break**:

- **Reuse first.** A page that needs only primitives that already exist is a
  cheap, low-risk way to prove the system generalises. A page that needs a new
  primitive should come *after* the pages that will reuse it, so the primitive
  is designed against two consumers rather than one.
- **Risk last.** Drag-and-drop, charts and a two-pane detail view are where a
  presentation change can silently alter behaviour. They go late, when the
  vocabulary is settled and the reviewer's eye is calibrated.
- **Blast radius.** `/projects` and the project layout are entered by almost
  every other page. Migrating them mid-programme would change the frame under
  pages already signed off.

### 1a. The order was revised after the first page

Requested change: **Board and Home first.** The original sequence was ordered by
engineering risk — cheap pages first, so the system was proven before anything
hard was built on it. The revised one is ordered by **what people see**: the
board and the home screen are where an impression is formed, and a migration
programme nobody can see the value of is a programme that gets cut.

The cost of the swap is real and worth stating: the drag primitive now gets
built on the harder of the two drag surfaces, and the board's own risk lands
first rather than fourth. It was paid immediately — the board had **no E2E
coverage at all**, so the safety net had to be written after the redesign
instead of before it (BRD-1), which is the exact inversion `/issues` was
careful to avoid.

**The project shell (#5) moved up with the board**, unavoidably: columns that
scroll independently need a container with a known height, and `PageShell` let
the document scroll. All seven project pages were checked in the new frame.

## 2. The order

| # | Page | Why here | New primitive needed | Risk |
|---|---|---|---|---|
| ✅ | **Board** + the project shell | Done 2026-09-03. Migrated first by request. Closed UX-5 (per-column paging), UX-11 (150px of shell), SEED-12, BRD-1. | `FilterChip`/`FiltersButton`/`FilterRow`/`FilterPanel`/`FilterToggleGroup`, `Bleed` | Paid |
| 2 | **Home** (`/home`) | Next, by request — the first screen after login | `Panel`, `StatTile` refresh | Low-med |
| 3 | **Projects list** (`/projects`) | The closest thing to `/issues` that exists: a list with a filter and a header. Almost pure reuse of `AppFrame` + `DataTable` + `Toolbar`, so it proves the system generalises before anything new is built on it. | none | **Low** |
| 4 | **Project issues** (`/projects/[id]/issues`) | The same table with a narrower scope. If `DataTable` cannot serve both the cross-project and the in-project list without a fork, that is the cheapest possible place to find out. | none | **Low** |
| 5 | **Backlog** (`/projects/[id]/backlog`) | First page with drag-and-drop, and the first that needs a **row that is also a drag handle**. Doing it here — while the table is still fresh — is what keeps `DataTable` honest about interactive rows instead of retrofitting later. | `SortableRow` wrapper | **Medium** — dnd-kit sensors and keyboard reordering must survive |
| 6 | **Project settings** | The shell is done; the form page inside it is not. First `measure="regular"` page, and the pattern admin and profile then copy. | `SettingsSection` | **Medium** — every project route renders through it |
| 7 | **Dashboards** (`/dashboards`) | Widget grid + ECharts. Depends on Home's panels. Charts get **token colours only** — no chart library change, no ECharts option rewrite beyond palette and font. | none new | **Medium** — chart theming is easy to get subtly wrong in both themes |
| 8 | **Workload** (`/workload`, `/workload/people`, `/workload/projects`) | Dense tables plus bar visualisations. Reuses the table and the chart tokens; nothing new. Late because it is read by managers and its numbers are the ones people quote — regressions here are expensive to notice. | none new | **Low-medium** |
| 9 | **Issue detail** (`/projects/[id]/issues/[issueId]`) | **Last, deliberately.** The densest screen in the product — comments, subtasks, dependencies, attachments, custom fields, time tracking, the Development panel, activity. It is where every primitive gets used at once, and it benefits most from a settled system. It is also the page where a careless change most easily loses an interaction nobody remembers exists. | `DetailPane`, `PropertyRow` | **High** |

**Admin, profile, notifications, timeline and calendar** are not in the nine and
are not forgotten. Admin and profile are `measure="regular"` form pages that
follow the settings pattern mechanically; timeline and calendar are
visualisation surfaces whose chrome is the only V1 part left.
They are a short tail after the nine, not a separate programme.

## 3. What "done" means for each page

The same gate as `/issues`, minus the parts that were one-time:

1. Every existing feature and interaction preserved — enumerated in the page's
   own section of this doc **before** the code changes, so "preserved" is a
   checklist and not an impression.
2. No service, repository, schema, API or permission change. If one turns out
   to be strictly required, it stops and is raised as its own decision.
3. Only the established tokens and primitives. **No page-specific CSS.** A page
   that seems to need a new primitive gets one added to `shared/`, reviewed on
   its own terms, and the fact recorded here.
4. E2E green with the flag **off** and **on**.
5. Screenshots at 1280×800 and 1920×1080.
6. Unit, integration and E2E suites all still green.
7. Backlog updated in the same change (CLAUDE.md rule 13).

**Stop rule:** if a page's migration introduces a regression, the next page does
not start until it is fixed or the page is reverted. One at a time, in order.

## 4. What is explicitly not happening

- No second repository, no long-lived V2 fork (ADR-0055).
- No framework change, no state-management change, no library swapped for
  visual reasons.
- No redesign of `/issues`. It is the reference; it changes only if a
  regression is found in it.
- No big-bang. Nine pages, nine changes, each reviewable on its own.
