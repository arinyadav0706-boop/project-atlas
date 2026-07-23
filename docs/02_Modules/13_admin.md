# Module: Admin (Platform Control Plane)

**Status:** Accepted v2.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-23

## Overview

Admin is the **central control plane** for EAGLES: org-wide configuration,
platform oversight, and feature rollout, all in one capability-gated console.
It is designed as a platform capability, not a single screen — new admin areas
(Users, Roles, Policy, Billing) plug in as **registry entries** without
touching the console or the authorization core (**ADR-0022**, **ADR-0023**).

Capabilities delivered here are separated into three tiers:

| Tier | What | Where |
|---|---|---|
| **MVP** | Admin console shell, Organization settings, **Feature Flags**, Audit Log viewer | this module, now |
| **Foundation** | Capability-gated authz seam, pluggable section registry, typed audit-action taxonomy, feature-flag platform (typed registry + per-org overrides + server-evaluated seam) | this module, now — the extensibility spine |
| **Future** | Delegated/custom admin scopes, org-policy config, billing, multi-org switch, impersonation, system-health, flag targeting/rollout | logged, additive behind the seams |

User Management (`14_user_management.md`), Roles (`15_roles.md`), and Profile
(`16_profile.md`) are **separate modules** that mount into this console via the
section registry + `AdminCapability.MANAGE_USERS` — no breaking change when they
land.

## Business Rules

- BR-1: Every admin endpoint is authorized server-side in the service layer via
  `requireCapability(actor, <capability>)` — never a client flag, never an
  inline `orgRole` check at the call site (ADR-0022 §1, Coding Standards §7). In
  V1 all capabilities resolve to `orgRole === "ADMIN"`.
- BR-2: `AuditLog` is **append-only** — this module exposes read (`list`, with
  filters) and the shared write (`record`), never update or delete (Security §5).
- BR-3: Sensitive admin actions are themselves audited: organization settings
  changes (`ORG_SETTINGS_CHANGED`) and feature-flag changes
  (`FEATURE_FLAG_CHANGED`), each with before/after (ADR-0022 §2).
- BR-4: `Organization.domain` is informational config metadata for
  `ALLOWED_EMAIL_DOMAINS` (ADR-0005) — editing it here does **not** flip the
  sign-in restriction; that stays an environment variable so a UI change can't
  lock everyone out.
- BR-5: A **feature flag** gates behavior/visibility only, never tenant
  isolation or role enforcement (ADR-0023 §2). Flags are org-scoped (F-1),
  evaluated server-side, and default to the code registry's `defaultEnabled`
  when no override row exists.
- BR-6: The flag **catalog** is code (typed registry); the DB stores only
  explicit per-org overrides. "Reset to default" deletes the override row
  (ADR-0023 §1).

## Database

- `Organization`, `AuditLog` (append-only) — `docs/03_Database/01_Database_Design.md §2`.
- `FeatureFlag` (new, `20260723140000_feature_flags`): per-org override rows,
  `@@unique([organizationId, key])` — §2 + §5.

## API (`docs/04_API/openapi.yaml`)

- `GET/PATCH /admin/organization` — org settings (audited).
- `GET /admin/feature-flags` — catalog + effective state per flag.
- `PATCH /admin/feature-flags/{key}` — set/reset an override (audited).
- `GET /admin/audit-log` — paginated, filterable (action/entityType/date), newest first.

All require the matching `AdminCapability`; non-holders get `403`.

## UI

`/admin` — a tabbed **console** whose tabs come from the admin-section registry
(only sections the actor's capabilities allow are shown). MVP sections:

- **Organization** — name/domain form.
- **Feature Flags** — one toggle row per registered flag (description, owner,
  effective state, override indicator, reset).
- **Audit Log** — paginated, filterable table (shadcn/ui `table`), newest first.

Screen #14 in `docs/05_UI/02_Screens_and_Information_Architecture.md`.

## Acceptance Criteria

- Given a non-ADMIN, when they load `/admin` or call any admin endpoint, they
  are redirected / receive `403`.
- Given an ADMIN edits the org name, an `AuditLog` entry records before/after.
- Given an ADMIN toggles a feature flag, the override persists, an `AuditLog`
  entry records before/after, and `FeatureFlagService.isEnabled` reflects it for
  that org only.
- Given a flag with no override row, `isEnabled` returns the registry default.
- Given a flag key removed from the registry, any stale override row is inert
  (never returned by the catalog endpoint or evaluated).
- Given 200 audit entries, the viewer paginates (never loads all at once).

## Validation

- `UpdateOrganizationInput`: `name` (1–200), `domain` (valid domain, optional,
  informational per BR-4).
- `SetFeatureFlagInput`: `enabled` (boolean) **or** `reset: true`; `key` must be
  a registered flag (unknown keys → `422`/`404`).
- `AuditLogQuery`: `page`/`pageSize` (bounded), optional `action`,
  `entityType`, `from`/`to` dates.

## Future Scope

- Delegated/custom admin scopes & roles (`15_roles.md`) — `resolveCapabilities`
  is the only change point.
- Dynamic `OrgSetting` store for policy config (session timeout, allow-list mgmt).
- Feature-flag targeting: percentage rollout, per-user/project, scheduling
  (ADR-0023 §4).
- Billing/subscription, multi-org switcher (V2 SaaS, ADR-0001), admin
  impersonation, system-health/metrics section, audit-log export.
