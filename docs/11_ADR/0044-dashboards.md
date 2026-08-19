# ADR-0044 — Dashboards

- **Status:** Accepted
- **Date:** 2026-08-10
- **Module doc:** `docs/02_Modules/25_dashboards.md`
- **Builds on:** ADR-0036 (chart kit), ADR-0040 (cross-project query + saved
  views), ADR-0043 (custom-field predicates)

## Context

The last three modules built the pieces: a cross-project query with
membership-scoped results, a filter language that now reaches custom fields, and
a charting kit. A dashboard is where those become an answer someone looks at
every morning rather than a query they retype.

The founder's instruction was explicit: **follow ClickUp and Asana, not Jira.**

## Decision

### 1. Everyone's, not the admin's

Any member creates dashboards. There is no `MANAGE_DASHBOARDS` capability, no
gadget catalogue an admin curates, and **no org-wide default dashboard**.

Jira's model — admin-owned system dashboards, gadgets, and sharing by
group/project/role — is the older design and the one people complain about.
ClickUp and Asana let anyone build one and share it simply. We are copying them
deliberately.

Sharing reuses the saved-view levels exactly: `PRIVATE` or `SHARED` (all active
org members, read-only). A fourth permission surface is not being invented for
this.

### 2. Results are scoped to the VIEWER, always

The rule from ADR-0040 §1 carries over unchanged: the projects a widget reads
come from the viewer's membership, and a widget's own `projectIds` can only
narrow that. A dashboard shared across the org shows each person their own
slice — one dashboard, honest numbers for everyone, no leak.

### 3. A widget owns its filter, and MAY point at a saved view instead

I said earlier that widgets would be backed by saved views. On writing it down
that is wrong for the primary case: it forces "create a view first" before you
can add a single stat tile, which is friction ClickUp does not have.

So a widget stores an inline `filter` (the same validated `IssueFilter` JSON as
a saved view), **or** a `savedViewId`. When it points at a view, the view's
filter is read live — editing the view updates every widget using it, which is
the reusability the saved-view option is for.

Both, because they answer different needs: inline for the one-off tile, a view
reference for the number five dashboards should agree on.

### 4. Three widget types, each a lens on the same query

`STAT` (a count), `BREAKDOWN` (group by status / priority / type / assignee,
drawn as a donut or bars), `LIST` (the top N issues).

Not one widget type per report. Velocity, burndown and cycle time already exist
on the Reports page, are per-project, and each needs its own configuration —
adding them here would make this module a container for four unrelated things.
They are a follow-up, listed in Future Scope.

Three generic types over a filter cover what a dashboard is actually for, and a
fourth is additive.

### 5. One batched data request, not one per widget

`GET /api/dashboards/{id}/data` returns every widget's data in one response.

Twelve widgets fetching independently is twelve round trips and twelve
membership resolutions. Batching resolves the viewer's project scope **once** and
reuses it, which is the expensive part. The cost is that a slow widget delays
the rest; bounded by the widget cap and the same page limits as every other
list.

### 6. Layout is a position and a width, not free-form coordinates

Widgets sit in a 3-column grid. Each has `position` (order) and `width`
(`SMALL`/`MEDIUM`/`LARGE` = 1/2/3 columns), reflowing to one column on narrow
screens.

Free pixel placement (ClickUp's newer boards) needs collision handling, a
responsive story for every arrangement, and stores coordinates that are wrong on
a different screen. An ordered list with widths gives the same look with none of
that, and it is what Asana does.

Reordering is drag-and-drop, on the dnd-kit setup the Board already uses — this
is the one place the founder asked specifically for the ClickUp feel, and arrows
would not deliver it.

The whole widget set is written in one `PUT`, so the array's order IS the
display order and there is no separate reorder call to fall out of step with it.
Widgets that already exist are **updated in place rather than recreated**: a
widget holds no data worth preserving, but its id keys the batched data
response, so recreating one on every save would invalidate that map and make a
drag blank every card while it refetched. An id the dashboard does not own is
treated as a create, never an update.

## Consequences

**Good.** No new permission surface. Widgets inherit custom-field filtering for
free. One membership resolution per dashboard load. The chart kit is reused
rather than extended.

**Costs.** A slow widget delays its dashboard (§5). No per-widget refresh
interval — the page is fetched when opened. Report widgets absent (§4). No
org-default dashboard, by choice (§1).

**Not decided here.** Report widgets, scheduled email digests, drill-through
from a chart segment into a filtered list, and dashboards over anything other
than issues.
