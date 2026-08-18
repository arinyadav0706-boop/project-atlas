# 22 — Saved Views

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0040-saved-views-and-cross-project-queries.md`
- **Depends on:** 04_issues (IssueFilter, ADR-0008), 03_projects (membership),
  15_roles (org role)

## 1. Overview

A cross-project issue list, and the ability to save a filter to it by name and
share it.

Every list in EAGLES before this is scoped to one project, so "all my open bugs"
or "everything due this week" could not be asked. This module adds the route
that answers those, plus persistence so the question does not have to be rebuilt
each time.

Scope: **filter, sort, save, share, delete.** Not column configuration (UX-7),
not bulk actions (a separate V2 module), not charts (Dashboards).

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | The result set is always the intersection of (a) the projects the viewer may see and (b) the view's `projectIds`, if it has any. A view is a lens over the viewer's own access, never a grant of access. |
| BR-2 | A viewer "may see" a project if they hold any project role on it, or they are an org `ADMIN`. Same rule the project pages already apply — resolved server-side, per request. |
| BR-3 | `projectIds` naming a project the viewer cannot see is **silently dropped**, not an error. A shared view must open for everyone it was shared with, showing each person their own slice. |
| BR-4 | Visibility is `PRIVATE` (owner only) or `SHARED` (all active org members, read-only). No other level exists in V1. |
| BR-5 | Only the owner or an org `ADMIN` may rename, edit, or delete a view. Sharing does not confer write. |
| BR-6 | A view stores a filter and a sort. Sorts: created, updated, due date, priority, key — each asc/desc. Default: updated desc. |
| BR-7 | The stored filter is validated with the same schema as the query string, on write and on read. Unknown keys are stripped. |
| BR-8 | A stored filter that fails validation resolves to the empty filter, and the view renders with a visible warning. It must never 500 — a rotted view still has to open so its owner can fix it. |
| BR-9 | Results are keyset-paginated with the same page cap as every other list (`DEFAULT_PAGE_SIZE` 50, `MAX_PAGE_SIZE` 100). A cross-project query is not exempt. |
| BR-10 | View names are unique per owner, trimmed, 1–80 characters. A duplicate name is a 409, not a silent second view. |
| BR-11 | Deleting a view is a soft delete, like everything else (`deletedAt`). |
| BR-12 | An issue appears at most once regardless of how many filter terms match it. |

## 3. Database

One new table. No changes to `issues`.

```prisma
model SavedView {
  id             String             @id @default(cuid())
  organizationId String
  ownerId        String
  name           String
  /// Validated IssueFilter (ADR-0040 §3). JSON so adding a filter needs no
  /// migration; parsed with Zod on read, so the shape is still enforced.
  filter         Json
  sort           SavedViewSort      @default(UPDATED_DESC)
  visibility     SavedViewVisibility @default(PRIVATE)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  createdBy String?
  updatedBy String?
  deletedAt DateTime?

  @@unique([ownerId, name])
  @@index([organizationId, visibility, deletedAt])
  @@map("saved_views")
}
```

`@@unique([ownerId, name])` enforces BR-10 in the database rather than in a
check-then-insert, which races.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/issues?<IssueFilter>&sort=&cursor=&take=` | The cross-project list. No view needed — this is the ad-hoc query. |
| `GET` | `/api/saved-views` | Views the caller may see: their own, plus shared. |
| `POST` | `/api/saved-views` | Create. |
| `PATCH` | `/api/saved-views/{id}` | Rename / re-filter / re-share. Owner or org admin (BR-5). |
| `DELETE` | `/api/saved-views/{id}` | Soft delete. Owner or org admin. |

## 5. UI

Route `/issues`, top-level in the sidebar.

- **Filter bar** — the existing shared filter controls plus project, status and
  "has estimate", operating across projects.
- **View rail** — the caller's saved views and shared views, with the active one
  marked. Selecting one applies its filter and sort.
- **Save / Save as** — appears once the filter differs from the loaded view.
- **Results** — the same issue row component the project list uses, plus a
  project column (the one thing a cross-project list needs that a scoped one
  does not).

**Deep link.** The filter is mirrored into the query string, so any state is
shareable as a URL without saving a view. Saving is for the queries worth
naming.

**UI-6 closes here.** Workload's estimate-coverage banner links to
`/issues?hasEstimate=false&status=…`, which is a real query rather than the dead
link that was shipped without.

## 6. Acceptance Criteria

1. A member of two projects sees issues from exactly those two, never a third.
2. An org admin sees all projects in their org, and none from another org.
3. A view shared by A and opened by B, where B lacks one of its projects, opens
   successfully and shows only B's projects' issues.
4. A view whose stored filter is corrupt opens with a warning and no filter.
5. A non-owner cannot PATCH or DELETE a shared view (403).
6. Creating a second view with an existing name for the same owner is a 409.
7. `hasEstimate=false` returns only issues with `estimateMinutes IS NULL`.
8. Paging with a cursor never repeats or skips an issue.

## 7. Validation

`savedViewSchema`: `name` trimmed 1–80; `filter` the existing
`issueFilterSchema`; `sort` the enum; `visibility` the enum. The filter parser is
shared with the query string, so the two cannot disagree (BR-7).

## 8. Future Scope

Per-team sharing (ADR-0040 §4 explicitly defers it), column configuration
(UX-7), bulk actions on a view's results, view-backed dashboard widgets,
"notify me when this view changes".
