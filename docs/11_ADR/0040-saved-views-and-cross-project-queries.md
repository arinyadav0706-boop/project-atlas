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

### 6. The result count is a bounded aggregate, not a change of retrieval strategy

*Added 2026-09-02, with the /issues gate.*

The list needed a denominator — "1–50 of 7,300" — and the temptation with a
denominator is to reach for `OFFSET`, because once you know there are 146 pages
it feels natural to address page 73 directly. **We did not.** Retrieval stays
keyset: `OFFSET 3600` reads and discards 3,600 rows before returning one, so
deep pages get progressively slower, while a cursor stays flat wherever you are
in the set. That property is worth more than jump-to-page.

So the count is exactly one extra thing: a second query, over the SAME
predicate, that returns an integer.

- **One filter builder.** `countIssues` calls `issueFilterWhere(...)` with the
  same scope, filter and resolved predicates that `listIssues` gets. A count
  built from a hand-written second clause is a count that disagrees with its
  own list the first time a filter grows a case — and it disagrees silently,
  because nothing on screen compares them. A unit test asserts the two calls
  against **each other** rather than against literals, so an argument added to
  one and forgotten on the other fails.
- **Bounded, at `COUNT_CAP` = 10,000.** `take` on a Prisma `count` compiles to
  `SELECT COUNT(*) FROM (SELECT id FROM issues WHERE … LIMIT $1) AS sub`, so
  the database stops at the cap instead of scanning five million rows, and no
  row crosses the wire. Past the cap the UI says "10,000+" and withdraws the
  page numbers, because a page count derived from a floor would name a last
  page that is not the last page. Jira and GitHub both cap for this reason.
- **Same scope as the rows.** The count runs on the resolved project scope
  (§1), never on the raw filter. A count that ignored scope would leak the size
  of a project the caller cannot open — the quietest kind of leak, because no
  row comes with it. Pinned by an integration test.
- **Measured:** 7 ms for the capped count over 7,300 matching issues on
  Postgres 16, run in parallel with the list query, so it adds no round trip.

Numbered pages are therefore offered only as far as the caller can actually
reach — every page already visited plus the next one, from the client's cursor
stack. Pages beyond that render as context rather than as controls. The
alternative was a button that looks clickable and cannot work.

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
