# Module: Admin

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

Org-wide settings and the audit log viewer, restricted to `orgRole = ADMIN`.
User management itself is a separate module (`14_user_management.md`) —
this module covers organization-level settings and oversight.

## Business Rules

- BR-1: Every endpoint under this module requires `orgRole = ADMIN`,
  checked server-side in the service layer — never inferred from a
  client-visible flag.
- BR-2: `AuditLog` is read-only from this module — no update/delete
  operation is ever exposed for it (Security Architecture §5).
- BR-3: Organization settings changes (`name`, `domain`) are themselves
  written to `AuditLog` (`action: ORG_SETTINGS_CHANGED`) since they're
  exactly the kind of sensitive, infrequent admin action the audit trail
  exists for.
- BR-4: The `domain` field here is informational/config metadata for
  `ALLOWED_EMAIL_DOMAINS` (ADR-0005) — changing it in this UI does **not**
  itself flip the sign-in restriction on; that's still an environment
  variable set by whoever operates the deployment, kept deliberately
  decoupled so a UI change can't accidentally lock everyone out.

## Database

`Organization`, `AuditLog` (read-only) —
`docs/03_Database/01_Database_Design.md §2.1, §2.13`.

## API

`GET/PATCH /admin/organization`, `GET /admin/audit-log` —
`docs/04_API/openapi.yaml`.

## UI

Screen #14 in `docs/05_UI/02_Screens_and_Information_Architecture.md`:
Org Settings form (name/domain) and a paginated, filterable
(action/entityType/date) Audit Log table (shadcn/ui `table`), newest
first.

## Acceptance Criteria

- Given a non-`ADMIN` user, when they attempt to load `/admin` or call any
  admin endpoint, then they receive `403`.
- Given an `ADMIN` updates the organization name, when saved, then an
  `AuditLog` entry records the before/after values.
- Given 200 audit log entries exist, when the `ADMIN` views the audit log,
  then it's paginated, not loaded all at once.

## Validation

`UpdateOrganizationInput`: `name` (1–200 chars), `domain` (valid domain
format, informational only per BR-4).

## Future Scope

- Multi-organization switcher (V2 SaaS conversion, ADR-0001).
- Org-wide policy configuration UI (session timeout, allow-list
  management) beyond the current env-var-driven approach.
- Billing/subscription management (V2 SaaS).
