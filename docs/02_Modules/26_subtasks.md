# 26 — Subtasks

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0045-subtasks.md`
- **Extends:** `04_issues.md` (a subtask IS an issue), ADR-0026 (the Epic level)
- **Touches:** 05_board, 06_backlog, 07_sprints, 22_saved_views, 25_dashboards

## 1. Overview

A second hierarchy level below Story/Task/Bug. A subtask is a **full issue** —
own key, status, assignee, comments, attachments, work logs, custom fields — not
a checklist item, because it has to be assignable to someone other than its
parent and has to show up in that person's Workload.

Hierarchy, end to end:

```
Epic                    (epicId)
└── Story | Task | Bug  (parentId)
    └── Subtask
```

Scope: one new level, both conversions, progress and time roll-up, and a
consistent answer across every list surface about whether subtasks are shown.
Not: dependencies, templates, drag-reordering within a parent.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A subtask is an issue of type `SUBTASK` with a non-null `parentId`. The two always agree: `type = SUBTASK` ⟺ `parentId IS NOT NULL`, enforced in the service **and** by a database `CHECK` constraint. |
| BR-2 | A parent must be a `STORY`, `TASK` or `BUG` in the **same project**. An `EPIC` may never be a subtask's direct parent; a `SUBTASK` may never be a parent; nothing is its own parent. Depth is capped by construction — no cycle walk exists or is needed. |
| BR-3 | A subtask never carries an `epicId`. It reaches its epic through its parent. |
| BR-4 | A subtask has no independent sprint. Moving a parent into a sprint or back to the backlog moves every one of its subtasks in the same transaction (ADR-0045 §5). |
| BR-5 | The **backlog excludes** subtasks, and so do the **sprint planning list and sprint progress counts** — a sprint's committed scope is the items the team committed to, and counting their subtasks turns "12 issues" into "40" with no extra commitment. The **board includes** them, each card badged with its parent's key, because a subtask has its own status and something with a status has to be movable somewhere. Cross-project `/issues`, saved views and dashboards include them and offer an explicit `subtask=only\|exclude` filter. |
| BR-6 | A subtask **cannot carry story points** — the field is refused, not ignored (ADR-0045 §7). Estimation happens at the level a team commits to. A conversion into a subtask clears any points the issue had, and says so first. |
| BR-7 | A parent **cannot transition into `DONE`** while any of its subtasks is open. The error names the count. Adding a subtask to an already-done parent is allowed. |
| BR-8 | Deleting a parent **soft-deletes its subtasks** (cascade). This differs from an Epic, whose children detach (ADR-0026 §2) — a subtask is a part of its parent, an epic's child is not. The confirmation states how many will go. |
| BR-9 | At most **50 subtasks** per parent. Beyond that it is not a task breakdown, it is a project, and the parent's detail page stops being readable. |
| BR-10 | Conversions: **issue → subtask** requires a parent and is refused if the issue is an `EPIC`, has epic children, or already has subtasks. **Subtask → issue** clears `parentId` and the type becomes `TASK`. Both are version-checked like any edit. |
| BR-11 | Roll-ups on the parent: subtask **progress** (`done / total`) and **remaining time** (parent + subtasks, in minutes). Never points (BR-6). |
| BR-12 | RBAC is unchanged — a subtask is an issue, so create/edit/delete follow `04_issues.md` BR-2 exactly. Creating a subtask requires write access to the parent's project. |
| BR-13 | A subtask's key comes from the same per-project counter as any issue (`VWP-412`). No compound or derived keys. |

## 3. Database

```prisma
enum IssueType { EPIC STORY TASK BUG SUBTASK }

model Issue {
  // …existing fields…
  /// Parent for a SUBTASK only. Separate from `epicId`, which is the
  /// Story→Epic link (ADR-0045 §4).
  parentId String?
  parent   Issue?  @relation("Subtasks", fields: [parentId], references: [id])
  subtasks Issue[] @relation("Subtasks")

  @@index([parentId])
}
```

Plus, in the migration and not expressible in Prisma:

```sql
ALTER TABLE "issues" ADD CONSTRAINT "issues_subtask_parent_check"
  CHECK (("type" = 'SUBTASK') = ("parentId" IS NOT NULL));
```

No other columns. A subtask reuses every column an issue already has.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/issues/{id}/subtasks` | A parent's subtasks plus the roll-up. |
| `POST` | `/api/issues/{id}/subtasks` | Create a subtask under this parent. |
| `PATCH` | `/api/issues/{id}` | `parentId` on the body converts in either direction (BR-10). |
| `GET` | `/api/issues?subtask=only\|exclude` | The shared filter's subtask control. |

The detail response (`GET /api/issues/{id}`) gains `parent`, `subtasks` and
`subtaskProgress`.

## 5. UI

- **Parent detail** — a Subtasks panel under the description: a progress bar
  with `3 of 5 done`, rolled-up remaining time when any is estimated, one row
  per subtask (type icon, key, title, assignee, status), and a one-line inline
  add. Inline, because "break this down" happens while reading the parent, and a
  modal for a one-field form is friction that stops people doing it.
- **Add subtask, two ways.** The inline field for speed, and **More options**
  beside it for the full form — description, assignee, priority, estimate —
  carrying over whatever was already typed. A title is often not the whole
  thought: "Write the migration" needs the paragraph saying *which* migration.
  Quick-add alone left the only route to that a second trip through the Edit
  dialog, which is not a route anybody finds.
- **Subtask detail** — a parent breadcrumb above the title, so a subtask is
  never a page you land on with no idea what it belongs to. The description is
  edited **in place** like any other issue's (see `04_issues.md §5`). Story
  points and Epic are absent from the form, not disabled (BR-3, BR-6).
- **Board / cross-project list** — a subtask card carries its parent's key as a
  chip; without it a board of subtasks is a list of orphan sentences.
- **Backlog** — subtasks do not appear (BR-5).
- **Create-issue dialog** — `Subtask` is not in the type list. A subtask is
  created from its parent, because it cannot exist without one.
- **Convert** — in the issue's `…` menu, both directions, each confirming what
  it will clear before it does it.

## 6. Acceptance Criteria

1. Creating a subtask under a Story yields a full issue with its own key,
   assignable to a different person than the parent.
2. A subtask does not appear in the backlog; it does appear on the board with
   its parent's key on the card.
3. Moving the parent into a sprint moves its subtasks; the subtask has no sprint
   control of its own.
4. Setting story points on a subtask is a 422.
5. Moving a parent to Done with one open subtask is a 409 naming the count;
   after that subtask is done, the move succeeds.
6. Deleting a parent soft-deletes its subtasks; deleting an Epic still detaches
   its children.
7. Converting a pointed issue into a subtask clears its points and its epic, and
   warns first.
8. A subtask cannot be given a subtask (422), and an Epic cannot be a subtask's
   parent (422).
9. The 51st subtask under one parent is a 409.
10. `subtask=exclude` on `/issues` removes them from a cross-project list.

## 7. Validation

`createSubtaskSchema` — the create schema minus `type`, `epicId` and
`storyPoints`; the parent comes from the route.
`updateIssueSchema` — gains `parentId: string | null`, and refuses
`storyPoints` on an issue that is (or is becoming) a `SUBTASK`.
`issueFilterSchema` — gains `subtask: "only" | "exclude"`.

## 8. Future Scope

Issue dependencies (blocks / blocked by), drag-reordering subtasks within a
parent, subtask templates ("every story gets Design / Build / Test"), a board
toggle to hide subtasks, bulk "convert selection to subtasks of…", and unifying
`epicId` into `parentId` as Jira did in 2023 (backlog ST-7).
