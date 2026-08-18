# ADR-0040 — Saved views and cross-project issue queries

- **Status:** Accepted
- **Date:** 2026-08-10
- **Supersedes:** nothing. Extends ADR-0008 (composable issue filter).
- **Module doc:** `docs/02_Modules/22_saved_views.md`

## Context

Every issue list in EAGLES is scoped to one project. `issueFilterWhere()` takes
a `projectId` as its first positional argument and there is no route that lists
issues across projects at all. Three consequences:

1. "What am I working on across everything?" is unanswerable except on Home,
   which shows a fixed, uncustomisable slice.
2. A filter a person builds is lost the moment they navigate away. Jira, ClickUp
   and Asana all persist and share these; it is table stakes for V2.
3. UI-6 has been open since the Workload pass: the estimate-coverage banner
   wants a "View unestimated issues" link and there is nowhere to send it,
   because no list is cross-project and no filter can express "has no estimate".

This is the first feature where a stored object determines *what rows a user
sees*, and the first that is shareable between users. Both make the access
decision worth writing down rather than discovering later.

## Decision

### 1. Project scope is derived server-side, never read from the saved filter

A saved view stores an optional list of `projectIds` to **narrow** to. It is
never the source of what the viewer may see. On every query the service:

1. resolves the viewer's visible project set from membership (plus org-admin
   override), then
2. intersects it with the view's `projectIds` if present.

A view therefore always renders **the viewer's own slice**. If a lead shares
"All open bugs" with a team, each member sees the bugs in the projects they
belong to, and nobody sees a project they were not added to. A stored
`projectIds` containing a project the viewer cannot access is silently dropped,
not an error — the view is a lens, not a grant.

This is the whole security position of the feature, and the reason `projectIds`
is a *narrowing* input rather than the query's scope.

### 2. `IssueFilter` gains `status` and `hasEstimate`; it stays one type

ADR-0008 established one filter type and one `where` builder shared by Board and
Backlog. Saved views become a third consumer, not a second filter language.

Two fields are added:

- **`status`** — Board expresses status through columns and Backlog ignores it,
  so the shared filter never needed it. A flat list does.
- **`hasEstimate`** — a tri-state (`true` / `false` / absent). `false` is
  literally the UI-6 link: "the open issues nobody has estimated".

`issueFilterWhere()` changes signature from `(projectId, filter)` to
`(scope, filter)` where scope carries `projectIds: string[]`. Board and Backlog
pass a single-element array. One builder still, so a filter cannot mean one
thing on the board and another in a view.

### 3. The filter is stored as validated JSON, not as columns

A column per filter field means a migration every time a filter is added, and
the filter is deliberately open to extension. The trade is that the database
cannot enforce the shape, so:

- the filter is parsed with the **same Zod schema** the query string uses, on
  write *and* on read;
- unknown keys are stripped rather than preserved, so a downgrade cannot
  resurrect a field the code no longer understands;
- a stored filter that fails to parse yields an **empty filter and a warning on
  the view**, never a 500. A saved view that has rotted must still open.

### 4. Two visibility levels only: `PRIVATE` and `SHARED`

`PRIVATE` is owner-only. `SHARED` is visible to every active member of the
organization. Deliberately **not** per-team or per-project ACLs: EAGLES has
three permission surfaces already (org role, project role, team management), and
a fourth needs its own decision rather than being smuggled in behind a
convenience feature. If per-team sharing is wanted, it is an amendment here.

Only the owner (or an org admin) may edit or delete a view. A shared view is
readable by others, never writable — otherwise one person's edit silently
changes what everyone else sees.

### 5. A view stores a filter and a sort. Not columns, not layout

Column visibility is already tracked as UX-7 and needs a per-user preference
store. Bundling it here would make this change the vehicle for a second feature
(CLAUDE.md rule 10). A view answers "which issues, in what order".

## Consequences

**Good.** One filter language across four surfaces. UI-6 closes. Bulk edit and
dashboards both need a cross-project query and now have one. The membership
intersection is written once, in the service, and every consumer inherits it.

**Costs, accepted.**

- Cross-project queries cannot use the per-project indexes as tightly. Mitigated
  by keyset pagination and a hard page cap, as everywhere else
  (`05_Performance_and_Scalability.md`); a view over 40 projects will be slower
  than a board and that is acceptable for a list the reader scrolls.
- The JSON column is unvalidated at rest. Mitigated by parse-on-read; the
  failure mode is a view that opens empty with a warning, which is recoverable
  by the owner.
- Sharing org-wide is coarse. Accepted for V2, revisit on request.

**Not decided here.** Per-team sharing, column configuration, view-level
permissions on *writing* issues (a view never grants edit rights — the existing
project-role checks still gate every mutation).
