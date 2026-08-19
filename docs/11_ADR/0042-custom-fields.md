# ADR-0042 — Custom fields: an org library, per-project enablement, typed EAV

- **Status:** Accepted
- **Date:** 2026-08-10
- **Module doc:** `docs/02_Modules/24_custom_fields.md`
- **Builds on:** ADR-0022 (admin control plane), ADR-0024 (permission engine)

## Context

`Issue` has a fixed shape. Every organisation that adopts a tracker eventually
needs a field it does not have — "Customer", "Environment", "Release", "Risk" —
and the absence of custom fields is the single most common reason teams outgrow
an internal tool and move to Jira.

EAGLES is one company's platform today but is written to be sold (ADR-0004,
portability). Whatever is chosen here is close to permanent: it shapes the
schema, every issue read, and eventually reporting.

## Decision

### 1. Typed EAV, not JSONB on `Issue`, not dynamic columns

Three tables: `CustomFieldDefinition`, `CustomFieldOption`, `CustomFieldValue`.
A value row holds `fieldId`, `issueId`, and **one** populated typed column
(`valueText`, `valueNumber`, `valueDate`, `valueBool`, `valueUserId`) plus a
join table for multi-select.

Rejected alternatives:

- **`Issue.customFields Json`.** Simpler writes, and tempting after the
  `SavedView.filter` precedent. But a saved view's filter is read by exactly one
  reader and is disposable; custom field values are *user data* that must
  survive a decade, be reported on, and be filtered efficiently. JSONB gives no
  referential integrity, so renaming or deleting a select option leaves orphaned
  strings scattered across thousands of rows, and per-type indexing is far
  weaker than a btree on a typed column.
- **Dynamic columns** (`ALTER TABLE` per field). Fastest to query, catastrophic
  operationally: DDL on every field creation, unbounded column count, and
  migrations that differ per tenant.

The cost of EAV, accepted: reading an issue with N custom fields is a join, not
a column read, and cross-field queries are more work. Bounded by a cap on fields
per project and by fetching values for one issue (or one page) at a time.

### 2. Fields live at the ORGANISATION; projects opt in

A definition belongs to the org — a field library, managed in Admin. A project
then **enables** the fields it wants, in its own display order, via
`ProjectCustomField`.

This is Asana's model rather than Jira's. Jira makes fields global and layers
"contexts" (per project × issue type) on top, which is powerful and is also the
part of Jira administrators most complain about. ClickUp scopes fields to a
space/folder/list with inheritance, which produces the opposite problem: the
same conceptual field defined five times with five ids, so it cannot be reported
on across the org.

One definition per concept, opt-in per project: "Customer" means one thing
everywhere, and a project that does not care never sees it.

### 3. Eight types, deliberately

`TEXT`, `NUMBER`, `DATE`, `CHECKBOX`, `SELECT`, `MULTI_SELECT`, `USER`, `URL`.

Jira ships around thirty. Most are variations (cascading select, labels, version
picker, group picker) that only make sense alongside features EAGLES does not
have. Eight covers what a 500-person org actually models, and each has an
unambiguous control, a validator, and a display. Adding a ninth is a small,
well-understood change; unshipping a bad one is not.

### 4. `required` is enforced on CREATE only

A required field blocks issue creation while it is enabled for that project. It
does **not** retroactively invalidate existing issues, and it does not block
edits.

An organisation that adds a required "Customer" field to a project with 3,600
existing issues would otherwise make every one of them unsavable until somebody
back-fills 3,600 values — including via bulk edit, which would start failing for
reasons the operator did not choose. Jira's required-on-transition has exactly
this reputation.

The UI marks a missing required value on existing issues so it can be fixed
deliberately. Enforcement on edit is a later decision, not an oversight.

### 5. Deleting a field is a soft delete; values are kept

Removing a definition hides it everywhere and stops it being set, but the value
rows remain. Custom fields hold facts about work that happened; destroying the
history because a field was retired is the kind of data loss that has no undo.

Select options behave the same way: an option is a row with an id, so renaming
"Tier 1" to "Priority Customer" preserves every value pointing at it, and
removing an option retires it without rewriting history.

### 6. Filtering, sorting and reporting on custom fields are NOT in V1

They need `IssueFilter` to become open-ended (typed predicates over arbitrary
field ids), which changes the shared where-builder, the saved-view storage
format, and the filter UI — a module in its own right, on top of this one.

V1 is: define, enable, set, display. That is a real limitation and it is written
here rather than discovered later. Logged as **CF-2**.

## Consequences

**Good.** One definition per concept, so cross-project reporting stays possible
later. Referential integrity for options. Retired fields keep their history.
Adding a type is additive.

**Costs.** A join per issue read. No filtering yet (CF-2). Required-on-edit not
enforced (§4). Per-project field ordering is a small join table that has to be
kept in step when a definition is soft-deleted.

**Not decided here.** Filtering/sorting (CF-2), per-issue-type fields (Jira's
contexts — deliberately skipped), formula/rollup fields, field-level
permissions, and custom fields on entities other than `Issue`.
