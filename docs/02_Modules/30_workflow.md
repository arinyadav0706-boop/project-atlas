# 30 — Custom statuses and workflow

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0049-custom-statuses-and-workflow.md`
- **Depends on:** 03_projects (owns the statuses), 05_board (renders them),
  04_issues (carries one), 15_roles (LEAD administers them)

## 1. Overview

Per-project issue statuses a team defines for itself — name, colour, order —
each mapped to a fixed **category** that the rest of the product reasons about.
Optionally, restricted transitions between them.

Scope: status CRUD with reorder and reassignment, a default status, the board
driven by statuses, and an opt-in transition matrix. Not: shared schemes across
projects, transition conditions/validators/post-functions, per-status WIP
limits.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A status belongs to **one project** and carries `name`, `category`, `color`, `position`, `isDefault`. |
| BR-2 | **`Issue.status` is the CATEGORY, not the status** (ADR-0049 §1). It is denormalised from `Issue.statusId` and must always equal that status's category — the invariant everything downstream rests on. Written in one place, in one update. |
| BR-3 | Categories are fixed: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`. Teams add statuses, never categories — a category is what reports, metrics, the dependency guard and the subtask roll-up reason about, and a user-defined one would mean nothing to them. |
| BR-4 | Status names are unique per project, case-insensitively. "Done" and "done" in one board is a data-entry bug, not a choice. |
| BR-5 | A project has exactly **one default status**, and new issues get it. Clearing the default is impossible; setting a new one moves the flag in the same write. |
| BR-6 | Deleting a status **requires a replacement** in the **same category**, and every issue on it moves there in one transaction. Refused for: the last status in a category, the default status, and a replacement in a different category (which would silently redefine "done" for that work). |
| BR-7 | Every project starts with the four seeded statuses — To Do, In Progress, In Review, Done — so a team that never opens the editor sees exactly what it saw before. |
| BR-8 | Reordering is a whole-list operation: the client sends the ordered ids and the server rewrites positions. Sending one moved id invites two clients to interleave into an order neither chose. |
| BR-9 | Statuses are administered by **LEAD** on the project, or an org ADMIN (ADR-0024), enforced server-side. Everyone who can see the project can read them. |
| BR-10 | **Transitions are unrestricted by default.** A project may set `enforceTransitions`, after which a move is allowed only if an explicit from → to pair exists. The refusal names the statuses that ARE reachable — "no" without "instead, these" is the thing people hate about Jira. |
| BR-11 | A status change is version-checked like any issue edit (ADR-0011) and needs the same write access. |
| BR-12 | Deleting a status deletes its transition rows; a transition may never point at a soft-deleted status. |
| BR-13 | Statuses are soft-deleted like every other entity (audit fields, `deletedAt`), so an issue's history still resolves a name that no longer exists. |

## 3. Database

```prisma
enum StatusCategory {          // renamed from IssueStatus (ADR-0049 §2)
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

model WorkflowStatus {
  id             String   @id @default(cuid())
  organizationId String   // denormalised for tenant-scoped queries (F-1)
  projectId      String
  name           String
  category       StatusCategory
  /// A design token name, never a hex value — themes have to keep working.
  color          String
  position       Int
  isDefault      Boolean  @default(false)
  // + audit fields, deletedAt
  @@unique([projectId, name])
  @@index([projectId, position])
}

model StatusTransition {
  id           String @id @default(cuid())
  projectId    String
  fromStatusId String
  toStatusId   String
  @@unique([fromStatusId, toStatusId])
}

model Issue {
  status   StatusCategory   // the CATEGORY (BR-2) — column unchanged
  statusId String           // the project status a human sees
}

model Project {
  enforceTransitions Boolean @default(false)
}
```

Migration is **expand → backfill → contract** (ADR-0049 §7): add `statusId`
nullable, seed four statuses per existing project, point every issue at the row
matching its category, then set `NOT NULL`.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/statuses` | The project's statuses, in order, with issue counts. |
| `POST` | `/api/projects/{id}/statuses` | Add one. |
| `PATCH` | `/api/projects/{id}/statuses/{statusId}` | Rename, recolour, change category, set default. |
| `DELETE` | `/api/projects/{id}/statuses/{statusId}` | Delete, with `replacementId` (BR-6). |
| `PUT` | `/api/projects/{id}/statuses/order` | Whole-list reorder (BR-8). |
| `PUT` | `/api/projects/{id}/transitions` | Replace the allowed set; toggle enforcement. |

## 5. UI

- **Project settings → Statuses** — a reorderable list grouped by category, each
  row with a colour swatch, inline-editable name, a category selector, an issue
  count, a "default" marker and a delete action that asks where its issues go.
- **Add status** — name, category, colour.
- **Transitions** — a switch, and when on a from → to matrix of checkboxes. The
  diagonal is a dash, not a checkbox: staying put is not a transition, and a box
  there would imply an issue could be forbidden from being where it is.
- **Board** — one column per status in `position` order, not four hard-coded
  ones; the column header carries the status colour.
- **Issue detail / board drag** — the status control lists this project's
  statuses; when enforcement is on, unreachable ones are disabled with the
  reason.

## 6. Acceptance Criteria

1. A new project starts with exactly the four seeded statuses, To Do default.
2. Adding "Blocked" in the IN_PROGRESS category makes it a board column, and an
   issue moved there reports category `IN_PROGRESS` to reports and the workload.
3. Renaming a status renames it everywhere it is displayed, immediately.
4. Reordering statuses reorders the board columns.
5. Deleting a status with issues on it requires a replacement and moves them all.
6. Deleting the default status, or the last status in a category, is refused.
7. `Issue.status` always equals the category of `Issue.statusId` — after a
   create, a board drag, a status change, a delete-with-reassign, and a category
   change on the status itself.
8. With enforcement off, any status can follow any status.
9. With enforcement on, a disallowed move is refused with a message naming what
   is reachable.
10. A MEMBER can move issues but cannot add, rename or delete a status; a VIEWER
    can do neither; an org ADMIN can do both.
11. Statuses in another organization's project are a 404.
12. Existing projects and issues survive the migration with their board
    unchanged: same four columns, same issues in them.

## 7. Validation

`createStatusSchema` — name 1–40 chars trimmed, category enum, colour from the
token set. `updateStatusSchema` — the same, all optional, plus `isDefault`.
`deleteStatusSchema` — `replacementId` required. `reorderStatusesSchema` — the
complete id list. `transitionsSchema` — `enforce` plus from/to id pairs, both
belonging to the project.

## 8. Future Scope

Shared status schemes across projects (WF-3), transition conditions, validators
and post-functions (WF-4), per-status WIP limits, automations triggered by a
transition, and a per-status SLA.
