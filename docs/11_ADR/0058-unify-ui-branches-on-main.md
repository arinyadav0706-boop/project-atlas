# ADR-0058: One UI on `main` — this branch's design system, main's pages

**Status:** Accepted
**Date:** 2026-11-08
**Deciders:** Founders

## Context

Two UI lines grew apart from merge base `13485c7`:

- `main` received 43 commits on 2026-10-18 from a separate tool
  ("Antigravity"): a new charter (`ANTIGRAVITY.md`), a different token set
  (`#FAFAFA` canvas, Google colour tokens), a client-side pagination hook,
  `DataTable`/`DataPagination`/`Drawer`/`Popover`/`Toolbar` primitives, and
  restyled admin, backlog, sprint, workload, automations and developer pages.
- `claude/project-atlas-init-q10cu7` carried 26 commits: the Home redesign
  approved against `docs/05_UI/reference/home-reference.webp` (ADR-0057), the
  current tokens, the 214px sidebar, the fixed-size panel rule, board columns
  that page (module 05 BR-9) and the `/issues` workspace with server paging and
  an honest total count (ADR-0040).

`main` is the branch Vercel deploys to production, so the two had to become one
there.

## Decision

`main` keeps every page and primitive from both lines, styled with **this
branch's** design system; where both lines rewrote the same file, the version
with more behaviour wins.

| Area | Taken from | Why |
|---|---|---|
| Tokens (`globals.css`, `tailwind.config.ts`), sidebar, top bar, stat tile, Home, project layout | this branch | Reviewed against the approved reference; the source of the fixed-size panel rule |
| Board card/column/view, `/issues` workspace | this branch | Behavioural superset: paged columns, server paging + bounded total, filter panel, a11y fix. `main`'s edits to these files were styling only |
| Admin, backlog, sprints, workload, automations, developer, labels, components, custom fields, notifications, teams, users, projects directory; new primitives and `usePagination` | `main` | Not touched by this branch; merged as-is, then mapped onto the tokens |

Utilities `main`'s pages used that resolve to nothing under either config were
mapped to the approved equivalents: `bg-card` → `bg-background`;
`shadow-xs`/`shadow-2xs` removed (panels are flat); `custom-scrollbar` →
`scroll-fade`; `hover:shadow-glow` removed. `src/tests/design-tokens.test.ts`
is the guard that found them.

`ANTIGRAVITY.md` and `.cursor/rules/antigravity-ui.mdc` are kept in the tree
for history but are **not** the design authority; `docs/05_UI/` and this ADR
are. Its "presentation layer only" boundary is consistent with `CLAUDE.md` and
still applies to any tool working on UI.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Take `main`'s pages wholesale, including board and `/issues` | Loses paged board columns, the `/issues` total count and the filter panel |
| Keep `main`'s tokens | Undoes the reviewed Home and the fixed-size panel rule |
| Leave the branches separate | Production keeps shipping the unreviewed UI; every later change pays a double merge |

## Consequences

- Positive: one UI and one rulebook on the production branch; no behaviour
  from either line is lost.
- Negative / trade-offs accepted: `main`'s pages adopt our tokens without a
  page-by-page visual review yet; lists using `usePagination` page in the
  browser rather than the server (UI-21).
- Follow-up actions required: screenshot review of every main page (UI-20);
  decide `vercel-build`'s `|| true` (DB-9); align the project issue list doc
  (UI-22).
