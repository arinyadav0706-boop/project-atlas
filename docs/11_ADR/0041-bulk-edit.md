# ADR-0041 — Bulk edit: partial success, and no per-issue version

- **Status:** Accepted
- **Date:** 2026-08-10
- **Module doc:** `docs/02_Modules/23_bulk_edit.md`
- **Builds on:** ADR-0040 (cross-project list), ADR-0011 (optimistic concurrency)

## Context

Saved Views produced the first list in EAGLES that spans projects. Changing the
assignee on thirty issues currently means thirty page visits. Jira, ClickUp and
Asana all have bulk edit; at 500 people it stops being a convenience.

Three properties of this codebase make it more than a loop:

1. **Permissions are per project.** A cross-project selection can contain issues
   the caller may edit and issues they may not.
2. **Status is a workflow, not a field.** `canTransition` forbids skipping
   stages, so "set these to Done" is legitimately impossible for some of the
   selection — not an error, a rule.
3. **Every issue carries a `version`** for optimistic concurrency (ADR-0011),
   and single-issue edits reject a stale write.

So a bulk operation over a heterogeneous selection will routinely be *partly*
applicable. How that is handled is the decision.

## Decision

### 1. Best effort with a per-issue outcome report — not all-or-nothing

Each issue is evaluated and written independently. The response reports, per
issue, whether it was `updated`, `skipped` (nothing to change), or `failed`
(with a reason).

The alternative — one transaction, all or nothing — was rejected. With
per-project permissions and a workflow-constrained status, a 40-issue selection
containing one archived project or one illegal transition would discard 39
legitimate edits, and the user's only recourse would be to deselect by trial and
error. Atomicity would be protecting an invariant that does not exist: these are
40 unrelated rows, not a transfer between two accounts.

**Each individual issue is still atomic.** The unit of atomicity is one issue,
not the batch.

The cost, accepted: a partly-applied bulk edit cannot be undone with one action.
Mitigated by the report naming exactly what changed, and by every change being
audited as usual.

### 2. Bulk edit does NOT take per-issue `expectedVersion` — but still bumps it

Single-issue edits require the version the client read, and 409 on a mismatch
(ADR-0011). Bulk edit deliberately does not.

**Why.** The list a bulk edit is launched from may be minutes old and can hold
100 rows. Requiring versions would make spurious conflicts the normal case —
any one row touched by anyone since load fails the batch — and users would learn
to reload and retry blindly, which is worse than no check. The operation is also
different in kind: bulk edit sets an *absolute* value ("assignee = Priya") over
a selection, not a delta against a value the user was reading. Last-write-wins
is the honest semantic for that.

**The subtlety that matters:** the write still increments `version`. A detail
page open on one of these issues will therefore 409 on its next save, exactly as
it should. Bulk edit opts out of *checking* the version, never out of
*maintaining* it. Getting this wrong would silently break single-issue OCC
everywhere.

### 3. Explicit ids only, capped at 100. No "apply to all matching the filter"

The competitors offer "select all N matching". That is a different and more
dangerous operation: the set is computed server-side at apply time, so the user
approves a count rather than a list, and a filter that widened between render
and apply hits rows they never saw. It also cannot be bounded.

V1 takes an explicit id array, capped at 100 — the page size. What you selected
is what changes.

### 4. Fields: status, assignee, priority, sprint. Absolute values only

No add/remove semantics (labels, components) in V1: those are multi-value and
need a three-state control (add / remove / leave) that the rest of the UI does
not have yet. Deferred to the module doc's Future Scope rather than half-built.

Clearing a field is expressed as an explicit `null`, distinct from "not
supplied" — the same convention the single-issue update already uses.

### 5. Permission and workflow are re-checked per issue, server-side

The client's selection is a request, never an authorisation. For each issue the
service resolves the project role, rejects archived projects, and validates the
transition. A row the caller may not edit comes back as `failed` with a reason,
not silently dropped — silently dropping teaches people the tool is unreliable.

## Consequences

**Good.** One endpoint, honest about partial outcomes. Single-issue OCC is
unaffected. The report makes "3 of 40 could not be changed, here's why" a normal,
visible result rather than a mystery.

**Costs.** No single undo. N+1 writes rather than one statement — bounded by the
cap of 100, and the alternative (one `updateMany`) cannot enforce per-issue
workflow rules, so it was never available. Notifications for reassignment fire
per issue, which at 100 issues is a lot of notifications; the module doc caps
that explicitly.

**Not decided here.** Select-all-matching-filter, label add/remove, undo, and
bulk delete — all listed in the module doc's Future Scope.
