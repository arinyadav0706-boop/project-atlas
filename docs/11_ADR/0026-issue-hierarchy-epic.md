# ADR-0026 — Issue Hierarchy: Single-Level Epic → Child, Detach-on-Delete

- Status: Accepted
- Date: 2026-07-24
- Deciders: Founding team
- Relates to: `docs/02_Modules/04_issues.md`

## Context

The `Issue` table already carries a self-referential parent link
(`epicId` → `Issue`, relation `EpicChildren`) with backend validation
(`validateEpic`), repository support, DTO field, and OpenAPI — but the product
never exposed it (no UI) and the validation had gaps (an Epic could be its own
parent or be nested under another Epic; delete left children pointing at a
removed Epic). We are **completing the existing feature**, not redesigning it,
and need to lock the model's boundaries so the completion — and future levels
(sub-tasks, initiatives) — stay coherent.

## Decision

### 1. One hierarchy level: Epic → (Story | Task | Bug)

The parent link expresses exactly one level. A **child** (`STORY`/`TASK`/`BUG`)
may reference one **parent Epic**; an **Epic never has a parent**. Consequences,
enforced server-side (and mirrored in the UI):

- An `EPIC` may not set `epicId` (no Epic-under-Epic nesting).
- An issue may not be its own parent (`epicId !== id`).
- The parent must be an `EPIC` in the **same project** (cross-project parenting
  is rejected — already enforced by scoping the lookup to `projectId`).
- **Cycles are impossible by construction**: since only non-epics can have a
  parent and epics cannot, the graph depth is at most 1 — there is no chain to
  form a cycle. No runtime cycle-walk is needed (and none is added).

### 2. Delete behavior: detach children (no orphans, no cascade)

Deleting an Epic (soft delete, like all issues) **detaches its children**
(`epicId → null`); the children are preserved as independent issues. We do
**not** cascade-delete children — they are real work items, not sub-parts of the
Epic — and we do **not** leave them pointing at a removed Epic. This mirrors the
existing component soft-delete-detaches-from-issues behavior (ADR-0018 BR-6), so
the app has one consistent "removing a grouping entity releases its members"
rule.

### 3. Reuse the existing backend; add only read helpers

Completion needs no schema change and no new write paths — `create`/`update`
already set `epicId` through the version-checked write (ADR-0011). We add only
**read** helpers: list a project's epics (for selectors/filters) and list an
epic's children (for the detail view), plus enrich the detail query to include
the parent Epic in the same round-trip (no N+1). The board's existing
`epicId` filter is wired to a UI control; no duplicate filtering logic.

### 4. Extensibility (designed for, not built)

- **Sub-tasks** (a second level below Story/Task) would reuse the same
  `epicId`-style parent pointer under a new rule set, or a dedicated
  `parentId` — the single-level rule here is the explicit line they'd extend,
  documented so it's a conscious change, not an accident.
- **Initiatives / roadmaps** (a level *above* Epic) would relax "an Epic has no
  parent" for the Epic type only — again, one rule, one place.
- **Roll-ups** (epic point/progress sums) read children via the same
  `listChildren` helper added here.

None of these are implemented now; nothing added today blocks them.

## Consequences

- Epics become fully usable end-to-end with no schema/migration change.
- The validation gaps found in the audit are closed and documented as business
  rules (`04_issues.md`).
- Delete is safe and consistent with the rest of the app; documented behavior.
- Deferred (rule #13): backlog group-by-epic (its own PR — a larger DnD change),
  epic roll-ups, sub-tasks, initiatives, issue links. All additive.
- No new index needed: child/epic lookups are covered by the existing
  `issues(projectId, …)` locality and the primary key; `listChildren(epicId)`
  filters a small per-epic set. Revisit only if epics grow very large.
