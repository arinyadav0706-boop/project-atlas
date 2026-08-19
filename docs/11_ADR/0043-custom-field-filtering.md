# ADR-0043 — Filtering by custom fields

- **Status:** Accepted
- **Date:** 2026-08-10
- **Module doc:** `docs/02_Modules/24_custom_fields.md` §9
- **Builds on:** ADR-0008 (one composable filter), ADR-0040 (cross-project
  query), ADR-0042 (custom fields)

## Context

ADR-0042 shipped custom fields able to be defined, set and displayed — but not
queried. Recording "Customer = Acme" on two hundred issues and then being unable
to ask "show me Acme's issues" is most of the value missing, and it was logged as
CF-2 at the time rather than discovered later.

The obstacle is that `IssueFilter` is a **closed** shape: a fixed set of named
keys, each mapping to one column. Custom fields are open — arbitrary field ids,
each with its own type and therefore its own operators and its own storage
column.

## Decision

### 1. One open-ended key on the existing filter, not a second filter language

`IssueFilter` gains `customFields?: CustomFieldPredicate[]`, where a predicate is
`{ fieldId, op, value? }`. Everything else about the filter is unchanged.

ADR-0008's rule holds: one filter type, one `where` builder, shared by Board,
Backlog, the cross-project list and saved views. A separate "advanced query"
path would immediately drift from the simple one — the exact failure that rule
exists to prevent.

### 2. The service resolves field types; the builder stays pure

A predicate carries a `fieldId`, not a type. Which column to read
(`valueText` / `valueNumber` / `valueDate` / `valueBool` / `optionIds`) depends
on the field's **declared** type, which only the database knows.

The client is not asked for it. A client-supplied type would let a crafted
request compare a NUMBER field against `valueText`, which is at best nonsense
and at worst a way to probe values across types.

So the service loads the definitions, produces `ResolvedPredicate[]` (fieldId +
type + op + value), and hands those to `issueFilterWhere`. Same shape as
`projectIds` in ADR-0040: **the untrusted input narrows, the server resolves.**
A predicate naming an unknown or deleted field is dropped, not an error — a
saved view outliving one of its fields must still open.

### 3. Each predicate is its own `some` clause

Two predicates become two separate `customFieldValues: { some: … }` entries
under `AND`, never two conditions inside one `some`.

One `some` asks "is there a value row matching *all* of these", which for two
different fields can never be true — every row belongs to exactly one field.
Getting this wrong returns zero results for every multi-field filter, silently.
Tested explicitly.

### 4. `is_empty` is `none`, and that works because clearing deletes the row

ADR-0042 BR-10 made "unset" a single representation: clearing a value deletes
the row rather than writing nulls. That decision pays off here — `is_empty` is
`{ customFieldValues: { none: { fieldId } } }`, one clause, no null-handling per
type. Had we stored empty rows, every type would need its own "column IS NULL
or empty string or empty array" test.

### 5. Sorting by a custom field is NOT included

Prisma can order a to-many relation only by `_count`; ordering by a value inside
it is not expressible. Verified against the generated client, not assumed:
`{ customFieldValues: { valueText: "asc" } }` is a type error, while
`{ customFieldValues: { _count: "asc" } }` compiles.

Supporting it means a raw-SQL query path with a `LEFT JOIN` — which would mean a
**second implementation of the whole filter**, in SQL, that has to agree with the
Prisma one forever. That is precisely the drift ADR-0008 forbids, for a feature
(sort by "Customer") far rarer than filtering by it.

Deferred as **CF-5**, with the constraint recorded so the next person does not
re-derive it.

### 6. Operators are bounded, and validated against the field's type

`eq`, `contains`, `gt`, `lt`, `any_of`, `is_empty`, `is_not_empty`. Which are
legal depends on the type — `contains` on a CHECKBOX is rejected rather than
silently ignored, the same posture as an out-of-range value.

## Consequences

**Good.** Custom fields become answerable. Saved views carry custom-field
predicates for free (the filter is stored as validated JSON, and the same schema
validates it on read). Board and Backlog inherit the capability without change.

**Costs.** One EAV join per predicate — bounded by the page cap and by the
number of predicates a person will realistically add. No sorting (CF-5). USER
predicates are limited to `is_empty`/`is_not_empty` in the UI until there is a
people picker (CF-4).

**Not decided here.** Sorting (CF-5), OR between predicates (everything is AND
today, as with the rest of the filter), and grouping/reporting by custom field.
