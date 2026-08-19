# 25 — Dashboards

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0044-dashboards.md`
- **Depends on:** 22_saved_views (cross-project query, sharing model),
  24_custom_fields (filter predicates), ADR-0036 (chart kit)

## 1. Overview

A page of widgets over the issue query. Anyone can build one; sharing is the
same two levels as saved views.

Scope: **three widget types** (stat, breakdown, list), a 3-column grid with
drag reordering, and org-wide or private sharing. Not report widgets, not
scheduled digests, not free pixel layout.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | Any active member may create, edit and delete their own dashboards. There is no admin capability for this (ADR-0044 §1). |
| BR-2 | Visibility is `PRIVATE` (owner only) or `SHARED` (all active org members, read-only). Only the owner — or an org admin — may edit or delete. |
| BR-3 | Every widget's results are scoped to the **viewer's** projects. A widget's `projectIds` narrows that set; it can never widen it (ADR-0040 §1). |
| BR-4 | A widget carries either an inline `filter` or a `savedViewId`, never both. A `savedViewId` is read live, so editing the view updates the widget. |
| BR-5 | A widget referencing a saved view the viewer cannot see (someone else's `PRIVATE`) renders as unavailable, not as unfiltered. Falling back to "everything" would silently show a wider set than intended. |
| BR-6 | Widget types: `STAT`, `BREAKDOWN`, `LIST`. A `BREAKDOWN` groups by `status`, `priority`, `type` or `assignee` and draws as horizontal bars. Bars for every dimension, not a donut: a breakdown by assignee routinely has 13 slices, and a 13-segment donut is unreadable at card size (backlog DSH-5). |
| BR-7 | At most 12 widgets per dashboard. Beyond that it is a report, not a dashboard, and the batched load stops being one cheap request. |
| BR-8 | Layout is `position` (order) + `width` (`SMALL`/`MEDIUM`/`LARGE` = 1/2/3 of a 3-column grid). Reflows to one column below `lg`. |
| BR-9 | Dashboard names are unique per owner, trimmed, 1–80 characters. A duplicate is a 409. |
| BR-10 | `LIST` widgets return at most 10 rows; `BREAKDOWN` at most 12 groups, with the remainder collapsed into "Other" so a 200-assignee org does not render 200 bars. |
| BR-11 | Deleting is a soft delete, like everything else. |
| BR-12 | A stored widget filter that fails validation yields an empty filter and a visible warning on that widget — the dashboard still opens (same posture as ADR-0040 BR-8). |

## 3. Database

```prisma
enum DashboardVisibility { PRIVATE SHARED }
enum DashboardWidgetType { STAT BREAKDOWN LIST }
enum DashboardWidgetWidth { SMALL MEDIUM LARGE }
enum DashboardBreakdownBy { STATUS PRIORITY TYPE ASSIGNEE }

model Dashboard {
  id             String   @id @default(cuid())
  organizationId String
  ownerId        String
  name           String
  visibility     DashboardVisibility @default(PRIVATE)
  widgets        DashboardWidget[]
  // audit + deletedAt
  @@unique([ownerId, name])
  @@index([organizationId, visibility, deletedAt])
}

model DashboardWidget {
  id          String @id @default(cuid())
  dashboardId String
  title       String
  type        DashboardWidgetType
  width       DashboardWidgetWidth @default(SMALL)
  position    Int
  /// Inline IssueFilter, validated on read. Ignored when savedViewId is set.
  filter      Json
  savedViewId String?
  breakdownBy DashboardBreakdownBy?
  @@index([dashboardId])
}
```

No new issue columns — a widget is a query, not a stored result.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboards` | The caller's dashboards plus everything shared. |
| `POST` | `/api/dashboards` | Create. |
| `GET` | `/api/dashboards/{id}` | One dashboard with its widgets (config only). |
| `PATCH` | `/api/dashboards/{id}` | Rename / re-share. |
| `DELETE` | `/api/dashboards/{id}` | Soft delete. |
| `PUT` | `/api/dashboards/{id}/widgets` | Replace the widget set and its order. A widget carrying an `id` this dashboard owns is updated in place, so ids survive a reorder; anything else is created, and anything absent is deleted. |
| `GET` | `/api/dashboards/{id}/data` | **Batched** data for every widget (ADR-0044 §5). |

## 5. UI

Route `/dashboards`, sidebar entry for everyone.

- **Rail** — the caller's dashboards and shared ones, same shape as the
  saved-view rail. `?d=<id>` is resolved server-side, so a dashboard is a link.
- **Grid** — 3 columns, widgets reflowing to one below `lg`. Cards sharing a row
  stretch to equal height, so the page reads as rows rather than a collage.
- **Edit mode** — one toggle, ClickUp's model. Off, the page is just the numbers;
  on, each card grows a drag grip and an edit pencil, and the delete/rename
  controls appear. Reordering saves immediately and refetches nothing — widget
  ids survive a save, so the data already on screen stays correct.
- **Widget card** — title, the value/chart/list, and a footer stating what it is
  counting and over how many projects ("this filter · 3 projects"), because a
  number without its definition is the thing that makes dashboards untrustworthy
  — and on a shared dashboard two people legitimately see different numbers.
- **Add / edit card** — one dialog: type, title, size, dimension for a
  breakdown, and the source as an explicit either/or — build a filter here, or
  point at a saved view. Removing a card lives in the same dialog.
- **Empty dashboard** — an empty state with the add action, not a blank grid.
- **Read-only** — a shared dashboard someone else owns shows no Edit and no Add;
  `canEdit` comes from the server, and the service re-checks it anyway.

## 6. Acceptance Criteria

1. A member sees only their projects' issues in every widget, even on a
   dashboard shared by someone with wider access.
2. A widget pointing at a saved view reflects an edit to that view without the
   widget being touched.
3. A widget pointing at someone else's private view renders "unavailable".
4. `BREAKDOWN` by assignee with 30 assignees renders 12 groups plus "Other".
5. A corrupt stored filter renders that widget with a warning; the rest load.
6. A 13th widget is a 422.
7. A non-owner cannot PATCH or DELETE a shared dashboard (403).
8. Reordering persists and survives a reload.

## 7. Validation

`createDashboardSchema` — name 1–80, visibility enum.
`widgetSchema` — title 1–60; type enum; width enum; `filter` the shared
`issueFilterSchema`; `savedViewId` optional; `breakdownBy` required when
type is `BREAKDOWN` and refused otherwise.

## 8. Future Scope

Report widgets (velocity, burndown, cycle time — per-project, each with its own
config), drill-through from a chart segment into `/issues` with that filter
applied, scheduled email digests, per-widget refresh, free pixel layout, and
dashboards over entities other than issues.
