# ADR-0023 — Feature Flags: Typed Registry with Per-Org DB Overrides, Server-Evaluated

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

A platform control plane needs a way to turn capabilities on and off per
organization **without a deploy** — to dark-launch a module, kill-switch a
misbehaving feature, or gate a beta to opt-in orgs. EAGLES ships modules
incrementally (many features are "deferred, additive behind a seam"), so flags
are the natural mechanism to land code dark and flip it live.

Constraints: stay portable (ADR-0004 — plain Postgres, no LaunchDarkly/vendor
SDK in feature code), no data duplication, strict TypeScript (no stringly-typed
flag keys), evaluated server-side (a client toggle is never a security
boundary), and every change audited. And no overengineering — V1 does **not**
need percentage rollouts, user targeting, or scheduling.

## Decision

### 1. The flag catalog is code, the overrides are data

The **source of truth for which flags exist** is a typed registry in code:

```ts
export const FEATURE_FLAGS = {
  "platform.commandPalette": {
    description: "Global ⌘K search palette in the top bar.",
    defaultEnabled: true,   // a kill-switch for a shipped feature
    owner: "search",
  },
  // …
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
```

The **`FeatureFlag` table** stores only *overrides* — one row per
`(organizationId, key)` that has been explicitly set. No override row ⇒ the
flag takes its registry `defaultEnabled`. This means:

- **No seeding, no drift**: adding a flag is one registry entry; it works
  immediately at its default with zero DB rows.
- **No orphans**: a registry key that's removed simply ignores any stale row.
- **Keys are typed**: `isEnabled(actor, "typo.here")` fails to compile.

### 2. Evaluation is a server-side service seam

```ts
FeatureFlagService.isEnabled(actor, key): Promise<boolean>
```

resolves org override → registry default, scoped to `actor.organizationId`
(F-1). Overrides for one request are loaded once and **request-cached**
(React `cache()`, same pattern as `getActor`) so a page gating several flags
pays one query. Consuming modules depend only on this method — never on the
table or the registry internals — so the backing store can change (Redis,
external service) with no caller change. This is the modularity line, matching
ADR-0020/0021.

Flags gate **behavior/visibility**, never tenant isolation — F-1 and role
checks are independent and always enforced regardless of any flag.

### 3. Admin manages overrides; every change is audited

`MANAGE_FEATURE_FLAGS` (ADR-0022) gates the admin UI and the
`PATCH /admin/feature-flags/{key}` endpoint. Setting an override writes an
`AuditLog` entry (`FEATURE_FLAG_CHANGED`, before/after) — flags are exactly the
sensitive, infrequent, "who turned that off?" action the audit trail exists for.
"Reset to default" deletes the override row.

### 4. Explicitly out of scope for V1 (Future)

Percentage/gradual rollout, per-user or per-project targeting, scheduled
flips, environment-specific values, and a client-side evaluation SDK. Each is
additive: targeting becomes extra columns + richer evaluation inside the same
`isEnabled` seam; none changes call sites.

## Consequences

- Modules can land dark and flip live per org with no deploy, via one typed
  call — the control plane the platform needs.
- Adding a flag: one registry entry (+ optional migrationless override at
  runtime). Removing one: delete the entry; stale rows are inert.
- New table `FeatureFlag` (`20260723140000_feature_flags`) — additive; must be
  applied to prod (GL-4). Deferred items logged (rule #13) per §4 above.
- Trade-off accepted: flags are evaluated server-side only in V1, so a
  flag-gated **client** interaction requires the gating decision to be passed
  down from a server component (as the command-palette gate does) — acceptable,
  and it keeps flags off the security-boundary-on-the-client anti-pattern.
