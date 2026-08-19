# 24 — Custom Fields

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0042-custom-fields.md`
- **Depends on:** 04_issues, 13_admin (control plane + audit), 15_roles

## 1. Overview

An organisation-level library of extra fields, which each project can enable and
order for itself. Values are set on the issue detail page.

Scope: **define · enable per project · set · display.** Filtering, sorting and
reporting on custom fields are explicitly out (ADR-0042 §6, backlog CF-2).

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A definition belongs to an organisation. Name is unique per org, case-insensitively, among non-deleted fields. |
| BR-2 | Types: `TEXT`, `NUMBER`, `DATE`, `CHECKBOX`, `SELECT`, `MULTI_SELECT`, `USER`, `URL`. A field's type is **immutable** after creation — changing it would reinterpret every stored value. Delete and recreate instead. |
| BR-3 | `SELECT`/`MULTI_SELECT` own an ordered list of options. Options are rows with ids, so renaming one preserves every value pointing at it. |
| BR-4 | Only an org admin holding `MANAGE_CUSTOM_FIELDS` may create, edit, or delete definitions and options. |
| BR-5 | A project enables the fields it wants, in its own order. A field not enabled for a project is invisible there and cannot be set. |
| BR-6 | Enabling/disabling a field for a project requires project `LEAD` (or org admin, who acts as LEAD — ADR-0024). |
| BR-7 | At most 30 fields enabled per project. A form with more is not a form. |
| BR-8 | Setting a value requires the same permission as editing the issue: project `MEMBER` or above, and the project must not be archived. |
| BR-9 | Values are validated against the field's type, server-side. A `NUMBER` rejects text; a `SELECT` rejects an option id belonging to another field; a `USER` rejects someone who is not a member of that issue's project; a `URL` accepts only `http`/`https`. |
| BR-10 | Clearing a value deletes the value row rather than storing an empty one, so "unset" has exactly one representation. |
| BR-11 | `required` is enforced when an issue is **created** in a project where the field is enabled. It is not enforced on edit and does not retroactively invalidate existing issues (ADR-0042 §4). |
| BR-12 | Deleting a definition is a soft delete. Value rows are retained; the field disappears from every project and issue. |
| BR-13 | Every definition change (create / update / delete) is audited. Value changes are not individually audited in V1 — that is issue history, tracked separately. |
| BR-14 | Reading an issue returns only values for fields currently enabled on that issue's project, in that project's display order. A value left behind by a disabled field is retained but not shown. |

## 3. Database

```prisma
enum CustomFieldType {
  TEXT
  NUMBER
  DATE
  CHECKBOX
  SELECT
  MULTI_SELECT
  USER
  URL
}

model CustomFieldDefinition {
  id             String          @id @default(cuid())
  organizationId String
  name           String
  type           CustomFieldType          // immutable (BR-2)
  description    String?
  required       Boolean         @default(false)
  options        CustomFieldOption[]
  projects       ProjectCustomField[]
  values         CustomFieldValue[]
  // audit fields + deletedAt
  @@index([organizationId, deletedAt])
}

model CustomFieldOption {
  id       String @id @default(cuid())
  fieldId  String
  label    String
  position Int                              // explicit order, not insertion
  @@index([fieldId, deletedAt])
}

// Which fields a project shows, and in what order (BR-5).
model ProjectCustomField {
  id        String @id @default(cuid())
  projectId String
  fieldId   String
  position  Int
  @@unique([projectId, fieldId])
}

// One row per (issue, field). Exactly one typed column is populated (ADR-0042 §1).
model CustomFieldValue {
  id          String    @id @default(cuid())
  issueId     String
  fieldId     String
  valueText   String?
  valueNumber Decimal?  @db.Decimal(18, 4)
  valueDate   DateTime?
  valueBool   Boolean?
  valueUserId String?
  optionIds   String[]                      // SELECT: one; MULTI_SELECT: many
  @@unique([issueId, fieldId])              // one value per field per issue
  @@index([fieldId])
}
```

`@@unique([issueId, fieldId])` is what makes a value an upsert rather than a
check-then-insert, which races.

`Decimal(18,4)` rather than `Float`: a custom field is as likely to hold money
or a contract value as a count, and float rounding on money is a bug that shows
up in a report months later.

`optionIds String[]` rather than a join table: options are bounded (a select
with 500 options is a mis-modelled field), the array is written and read
atomically with the rest of the value row, and referential integrity is enforced
in the service against the field's own option list — a join table here would add
a third write per value for no gain at this size.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/custom-fields` | The org's field library. |
| `POST` | `/api/admin/custom-fields` | Create a definition (+ options). |
| `PATCH` | `/api/admin/custom-fields/{id}` | Rename, describe, toggle required, edit options. Type is rejected. |
| `DELETE` | `/api/admin/custom-fields/{id}` | Soft delete. |
| `GET` | `/api/projects/{projectId}/custom-fields` | Fields enabled here, in order, plus what else is available. |
| `PUT` | `/api/projects/{projectId}/custom-fields` | Replace the enabled set and its order. |
| `PUT` | `/api/issues/{issueId}/custom-fields` | Set/clear values on one issue. |

## 5. UI

- **Admin → Custom Fields** — the library: name, type, options, required, usage
  count. Type is shown as read-only once created (BR-2), with the reason.
- **Project → Settings → Custom fields** — a two-column enable/disable list with
  ordering for the enabled side.
- **Issue detail** — enabled fields render in the metadata rail beneath the
  built-in ones, each with the control its type implies, saved on blur/change.
  A missing required value is marked (BR-11) rather than blocking the save.

## 6. Acceptance Criteria

1. A field created in Admin appears in a project only after being enabled there.
2. `NUMBER` rejects `"abc"` with a 422; `URL` rejects `javascript:`.
3. A `SELECT` value referencing an option from a different field is rejected.
4. A `USER` value must be a member of that issue's project.
5. Renaming an option leaves every issue's value intact.
6. Soft-deleting a definition hides it everywhere; re-reading an issue that had
   a value for it returns nothing, and the row still exists in the database.
7. Creating an issue without a required enabled field is a 422; editing an
   existing issue that lacks it succeeds.
8. Clearing a value removes the row (BR-10).
9. A VIEWER cannot set a value (403).
10. Enabling a 31st field for a project is a 422 (BR-7).

## 7. Validation

`customFieldDefinitionSchema` — name trimmed 1–60; type from the enum, refused
on update; options 0–100, label 1–60.
`customFieldValuesSchema` — a map of `fieldId → value | null`, where the value
shape is checked against the definition's type in the service (the schema cannot
know the type from the payload alone).

## 8. Future Scope

**CF-2: filter/sort/report on custom fields** — the significant one. Also:
per-issue-type fields (Jira contexts), formula and rollup fields, field-level
permissions, cascading select, custom fields on projects and sprints, and
required-on-edit or required-on-transition.
