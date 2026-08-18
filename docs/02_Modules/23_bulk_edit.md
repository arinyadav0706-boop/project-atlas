# 23 — Bulk Edit

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0041-bulk-edit.md`
- **Depends on:** 22_saved_views (the cross-project list), 04_issues (rules),
  15_roles (project role), 13_admin (audit)

## 1. Overview

Select issues in the cross-project list and change one or more fields on all of
them at once.

Scope: **status, assignee, priority, sprint**, over an explicit selection of up
to 100 issues, with a per-issue result. Not bulk delete, not label add/remove,
not "apply to everything matching the filter" — see Future Scope.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | The caller supplies an explicit list of issue ids, 1–100. Not a filter (ADR-0041 §3). |
| BR-2 | At least one field must be supplied, or the request is rejected. An empty change is a mistake, not a no-op. |
| BR-3 | Every issue is evaluated independently and reported as `updated`, `skipped`, or `failed` with a reason (ADR-0041 §1). One issue's failure never blocks another's success. |
| BR-4 | Permission is re-resolved **per issue** from its project. A caller without write on that project gets `failed: forbidden` for that issue — never a silent drop. |
| BR-5 | Issues in `ARCHIVED` projects fail with `archived`. Archived projects are read-only everywhere. |
| BR-6 | A status change must satisfy the workflow (`canTransition`, 04_issues BR-5). An illegal jump fails with `invalid_transition` — a rule, not an error in the request. |
| BR-7 | An issue already holding every requested value is `skipped`, not `updated`. Nothing is written and no audit row is created. |
| BR-8 | An assignee must be a member of that issue's project. Cross-project bulk assignment fails per issue with `invalid_assignee` where it does not hold. |
| BR-9 | A sprint must belong to that issue's project. Same failure shape. |
| BR-10 | `null` clears a field (assignee, sprint). Absent means "leave alone". The two are distinct. |
| BR-11 | No `expectedVersion` is required, but `version` is still incremented on every write, so single-issue optimistic concurrency keeps working (ADR-0041 §2). |
| BR-12 | Status changes are audited as `ISSUE_STATUS_CHANGED`, exactly as single transitions are — the cycle-time report reads that trail and must not develop a hole. |
| BR-13 | Assignment notifications fire only for issues whose assignee actually changed to *someone else*, and are capped at 25 per operation. Beyond that they are suppressed and the response says so — a 100-issue reassignment must not spam one person with 100 notifications. |
| BR-14 | The whole operation is one API call. The client never loops. |

## 3. Database

**No schema change.** Bulk edit writes the same columns the single-issue update
does, through the same version-incrementing path.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/issues/bulk` | Apply a change set to a selection. |

Request:

```jsonc
{
  "issueIds": ["...", "..."],          // 1–100 (BR-1)
  "changes": {
    "status":   "IN_PROGRESS",         // optional
    "assigneeId": null,                // optional; null clears (BR-10)
    "priority": "HIGH",                // optional
    "sprintId": null                   // optional; null removes from sprint
  }
}
```

Response `200` — the operation succeeded as an operation, even when some issues
failed. HTTP status describes the request, not the rows.

```jsonc
{
  "updated": 37,
  "skipped": 1,
  "failed": 2,
  "results": [
    { "issueId": "...", "key": "VWP-12", "outcome": "updated" },
    { "issueId": "...", "key": "OPS-3",  "outcome": "skipped" },
    { "issueId": "...", "key": "VDP-9",  "outcome": "failed",
      "reason": "invalid_transition",
      "message": "Cannot move from TODO to DONE — it must pass through the workflow in order." }
  ],
  "notificationsSuppressed": false
}
```

Reasons: `not_found`, `forbidden`, `archived`, `invalid_transition`,
`invalid_assignee`, `invalid_sprint`, `conflict`.

`422` for a malformed request: no ids, more than 100, or no changes. (422, not 400 — `handleRoute` maps every `ZodError` to 422 across the whole API, and bulk edit does not get its own convention. Verified against the running route.)

## 5. UI

On `/issues`:

- **Row checkboxes**, plus a header checkbox selecting everything on the page.
  Shift-click extends a range from the last row clicked.
- **Action bar** appears when the selection is non-empty: the count, the field
  controls, Apply, and Clear. It is sticky at the bottom so the selection stays
  reachable while scrolling a long list.
- **Result toast**: "37 updated · 1 unchanged · 2 couldn't be changed". When
  anything failed it is a warning toast naming the first three failures by issue
  key and reason. A failure the user cannot see is a failure they will repeat.
- The list refreshes after a successful apply, and the selection clears.

**Deliberately no "select all 3,600 matching"** (ADR-0041 §3). The header
checkbox selects the loaded page and says so.

**v1 control set: status, priority, and assignee as me/unassign only.** A full
assignee picker needs a people list scoped to the selection, and a sprint picker
needs the sprints of whichever projects are selected — neither is well-defined
for a cross-project selection until a per-project control exists. The API
supports all four fields today; the bar offers the three that can be answered
unambiguously.

The bar's controls are labelled "Set status" / "Set priority" / "Set assignee",
not "Status" / "Priority" — the filter bar above already owns those accessible
names, and two controls sharing a name on one page is ambiguous to a screen
reader.

## 6. Acceptance Criteria

1. 40 issues, one in a project the caller cannot write: 39 updated, 1 failed
   `forbidden`, and the 39 are genuinely changed in the database.
2. A TODO → DONE bulk change fails those issues with `invalid_transition` and
   leaves them untouched.
3. An issue already at the requested values is `skipped` and gets no audit row.
4. `version` increments on every updated issue; a detail page open on one of
   them 409s on its next save.
5. `assigneeId: null` clears the assignee; omitting `assigneeId` leaves it.
6. 101 ids is a 422.
7. No changes supplied is a 422.
8. Status changes appear in the audit log as `ISSUE_STATUS_CHANGED`.
9. Reassigning 30 issues to one person sends at most 25 notifications and sets
   `notificationsSuppressed`.

## 7. Validation

`bulkEditSchema`: `issueIds` — array of non-empty strings, min 1, max 100,
de-duplicated. `changes` — an object with at least one key present; `status`,
`priority` reuse the issue enums; `assigneeId`, `sprintId` are nullable strings.

## 8. Future Scope

Apply-to-all-matching-filter (needs a confirmation step showing the count and a
server-side re-count at apply time), label/component add-remove (needs the
three-state control), bulk delete, undo, and bulk edit inside the Board and
Backlog once selection exists there.
