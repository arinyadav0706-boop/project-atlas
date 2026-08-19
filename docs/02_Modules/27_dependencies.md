# 27 — Issue Dependencies

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0046-issue-dependencies.md`
- **Extends:** `04_issues.md`
- **Touches:** 05_board, 22_saved_views, 25_dashboards, 19_notifications

## 1. Overview

Typed links between issues — the **ordering** relationship, as opposed to the
containment ones EAGLES already has (Epic → child, parent → subtask).

Three types: `BLOCKS`, `RELATES_TO`, `DUPLICATES`. Links may cross projects
within one organisation. Blocking cycles are refused. A blocked issue can still
be completed, but the UI asks first — and when a blocker closes, whoever was
waiting is told.

Not in scope: Timeline/Gantt arrows, critical path, auto-scheduling, a
configurable link-type catalogue.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | Three link types. `BLOCKS` and `DUPLICATES` are directional and read from both ends (`A blocks B` ⇒ B *is blocked by* A). `RELATES_TO` is symmetric. |
| BR-2 | One row per link. The inverse is **derived**, never stored — two rows per link is how a link table drifts into A-blocks-B while B-is-blocked-by-nothing. |
| BR-3 | Symmetric links are normalised so the smaller id is always `source`. Without it "A relates to B" and "B relates to A" are two rows the unique index cannot see are one fact. |
| BR-4 | No self-links. No duplicate `(source, target, type)` — enforced by a unique index, and by normalising direction for symmetric types first. |
| BR-5 | Both issues must be in the caller's **organisation**, and the caller must be able to see both to *create* a link. Projects may differ (ADR-0046 §3). |
| BR-6 | On read, a link to an issue in a project the viewer cannot see renders as a **restricted placeholder** — the link is shown, the issue's title is not. Hiding it would make the list silently incomplete. |
| BR-7 | A `BLOCKS` link that would close a cycle is refused (409) with the path named. Bounded walk; a graph exceeding `MAX_CYCLE_NODES` refuses rather than hanging. |
| BR-8 | A blocked issue **can** be marked Done. The UI warns and names the open blockers; the API allows it. Deliberately unlike the subtask rule (ADR-0046 §5) — a subtask is part of its parent, a blocker is a separate issue and the assertion goes stale. |
| BR-9 | When an issue moves to `DONE`, the assignees of every issue it was blocking are notified that they are unblocked. Best-effort, like all notifications (ADR-0019). |
| BR-10 | At most **50 links** per issue. Beyond that the panel is unreadable and the relationship has stopped being information. |
| BR-11 | Creating or removing a link needs write access to **at least one** of the two issues' projects — the same bar as editing an issue. Reading follows normal issue visibility. |
| BR-12 | Deleting an issue (soft) hides its links from both ends. Links are not separately soft-deleted when their issue goes; the query filters on the issues' own `deletedAt`. |
| BR-13 | `GET /api/issues?blocked=true` returns issues with at least one **open** blocker. Not "has any blocker" — an issue blocked by finished work is not blocked. |

## 3. Database

```prisma
enum IssueLinkType { BLOCKS RELATES_TO DUPLICATES }

model IssueLink {
  id             String        @id @default(cuid())
  organizationId String
  sourceId       String
  source         Issue         @relation("LinkSource", fields: [sourceId], references: [id])
  targetId       String
  target         Issue         @relation("LinkTarget", fields: [targetId], references: [id])
  type           IssueLinkType
  // audit
  @@unique([sourceId, targetId, type])
  @@index([targetId, type])
  @@index([organizationId])
}
```

`organizationId` is denormalised onto the row so a tenant-scoped read never has
to join two issues to two projects to two organisations.

No column on `Issue`. "Blocked" is a question asked of this table, not a flag
that could fall out of step with it.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/issues/{id}/links` | Every link on this issue, both directions, grouped. |
| `POST` | `/api/issues/{id}/links` | Link this issue to another (`type`, `targetKey` or `targetId`, `direction`). |
| `DELETE` | `/api/issue-links/{linkId}` | Remove a link. |
| `GET` | `/api/issues?blocked=true` | Everything with an open blocker (BR-13). |

The issue detail response gains `links` and `openBlockers`.

## 5. UI

- **Linked issues panel** on the issue detail, under Subtasks. Grouped by
  relationship with the sentence as the heading — "Blocked by", "Blocks",
  "Relates to", "Duplicates", "Duplicated by" — because a reader should not have
  to work out the direction from an arrow glyph.
- **Add link** — one row: relationship picker, then an issue search by key or
  title (cross-project, scoped to what the viewer can see).
- **Blocked badge** on board cards and list rows when an issue has an open
  blocker. Red-tinted, with the blocker count.
- **Completing a blocked issue** — a confirm dialog naming the open blockers,
  not a refusal (BR-8).
- **Restricted rows** render as `VWP-12 · You don't have access to this issue`
  with no title and no link (BR-6).

## 6. Acceptance Criteria

1. `A blocks B` created from A's page appears on B's page as "Blocked by A".
2. `A relates to B` created from either side produces exactly one row, and
   creating it again from the other side is a 409.
3. A → B → C → A on `BLOCKS` is refused with the cycle named.
4. A link to an issue in a project the viewer cannot see shows as restricted,
   with no title.
5. Marking a blocked issue Done asks for confirmation and then succeeds.
6. Completing a blocker notifies the assignee of the issue it was blocking.
7. `?blocked=true` returns the blocked issue while its blocker is open, and stops
   returning it once the blocker is Done.
8. The 51st link on one issue is a 409.
9. Self-linking is a 422.

## 7. Validation

`createLinkSchema` — `type` enum; exactly one of `targetId` / `targetKey`;
`direction` (`outward` | `inward`, default `outward`) so "blocks" and "is
blocked by" are both expressible from one form without a second endpoint.

## 8. Future Scope

Timeline/Gantt with dependency arrows, critical path, auto-scheduling dates from
dependencies, sprint warnings when a committed issue's blocker is not in the
sprint, bulk-link from a selection, and a fourth link type if a team can name
what it is for.
