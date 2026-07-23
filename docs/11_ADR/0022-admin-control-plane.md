# ADR-0022 — Admin as a Control Plane: Capability-Gated Console with Pluggable Sections

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

`13_admin.md` (Draft v1.0) scoped Admin as two screens: org settings + an
audit-log viewer, each guarded by `orgRole === "ADMIN"`. That works for today,
but Admin is really the **platform control plane** — the place where org-wide
configuration, oversight, feature rollout, user governance, and (later)
policy/billing live. Bolting each of those on as another `orgRole === "ADMIN"`
check in another ad-hoc screen would rot fast:

- Authorization is **stringly/inline** — every admin action re-checks
  `orgRole === "ADMIN"`. When we add delegated scopes ("audit-viewer",
  "billing-admin", custom roles — all flagged Future in `15_roles.md`), we'd
  touch every call site.
- Audit actions are **free-text strings** scattered across services
  (`"ORG_SETTINGS_CHANGED"`, `"ISSUE_STATUS_CHANGED"`), with no catalog — easy
  to typo, impossible to enumerate.
- The console's **sections** (tabs) would be hardcoded, so every new admin
  area is a layout edit plus a nav edit plus a guard edit.

We want a control plane that new modules extend **without breaking changes**,
while avoiding speculative machinery we don't need yet (CLAUDE.md rule #10).

## Decision

### 1. Capability-based authorization behind a single seam

Admin actions are gated by a **capability**, not a raw role check:

```ts
enum AdminCapability {
  MANAGE_ORGANIZATION,
  MANAGE_FEATURE_FLAGS,
  VIEW_AUDIT_LOG,
  MANAGE_USERS,   // consumed by module 14 when it lands
}

requireCapability(actor, AdminCapability.MANAGE_FEATURE_FLAGS); // throws ForbiddenError
```

In V1 **every capability resolves to `orgRole === "ADMIN"`** — one function,
`resolveCapabilities(actor)`, returns the set. That is the *entire* indirection
and it is deliberate: the day we add delegated admin scopes or custom roles
(`15_roles.md` Future Scope), we change `resolveCapabilities` **only** — no
service or route changes. Call sites already ask "does the actor have this
capability?", never "is the actor an ADMIN?". This is the same
registry/seam idiom as ADR-0020 (reports) and ADR-0021 (search): the
extensibility line is one function, not an abstract framework.

RBAC remains **server-side in the service layer** (Coding Standards §7,
`13_admin.md` BR-1). The sidebar/console gating by `orgRole` stays a pure UX
convenience.

### 2. A typed audit-action taxonomy

Audit actions become a typed catalog (`AuditAction`), not free strings:

```ts
export const AuditAction = {
  ORG_SETTINGS_CHANGED: "ORG_SETTINGS_CHANGED",
  FEATURE_FLAG_CHANGED: "FEATURE_FLAG_CHANGED",
  // … existing issue/comment/etc. actions migrate here incrementally
} as const;
```

New admin writes use it immediately. Existing string actions keep working and
migrate opportunistically (logged as tech debt) — no big-bang rewrite. The
audit **write** path is unchanged (`AuditLogService.record`, append-only,
`13_admin.md` BR-2); this ADR adds the **read** path (`list` with filters) and
the taxonomy.

### 3. A pluggable admin-section registry

The console's tabs are **registry entries**, not hardcoded markup:

```ts
interface AdminSection {
  id: string;
  label: string;
  href: string;
  capability: AdminCapability; // gates both nav visibility and the page
  order: number;
}
```

Adding an admin area (Users, Roles, Policy, Billing) = one registry entry + its
page. The console layout renders whatever sections the actor's capabilities
allow. This is the "compatible with all future modules without breaking
changes" guarantee, concretely.

### 4. Org settings stay on the `Organization` row (no premature KV store)

MVP org settings are `name` + `domain` (informational, `13_admin.md` BR-4),
which already live on `Organization`. We do **not** introduce a generic
settings key-value table yet (rule #10). When a genuinely dynamic policy set
arrives (session timeout, allow-list management), a structured `OrgSetting`
store is the documented extension — behind `OrganizationService`, so callers
don't change.

## Consequences

- Adding a delegated admin scope or custom role touches exactly one function.
- Adding an admin console section is one registry entry + one page.
- Audit actions are enumerable and typo-proof going forward.
- Deferred (logged, rule #13): delegated/granular capabilities and custom roles
  (`15_roles.md`), migrating legacy string audit actions to the taxonomy, the
  dynamic `OrgSetting` store, org-policy config UI, billing, multi-org
  switching, admin impersonation, and a system-health section. All are additive
  behind the capability seam + section registry.
