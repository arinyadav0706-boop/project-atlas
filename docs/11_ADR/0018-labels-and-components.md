# ADR-0018 — Labels & Components: Governance and Data Model

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

Issues need two orthogonal classification axes that already appear in the
Board's filter contract (`labelIds`) and the Jira-parity target:

- **Labels** — lightweight, cross-cutting tags (`frontend`, `tech-debt`,
  `needs-design`). Many per issue. Their value is *consistent* grouping and
  filtering across every project and in Reports later.
- **Components** — named sub-systems of a *single* project (`Payments API`,
  `Mobile App`), each optionally routing new work to a default owner.

The `Label` + `IssueLabel` tables already exist (org-scoped entity, `color`,
audit, soft-delete). There is **no** `Component` table yet.

Two decisions are hard to reverse and must be settled before code: the
**governance model** (who may create/mutate these shared entities) and the
**data model** (scope, cardinality, uniqueness).

## Decision

### 1. Labels are managed *entities*, not free-text strings

We reject Jira's free-form string model. Our schema already commits to an
entity (id + color + audit), and free-form tags fragment exactly the
filtering/reporting EAGLES exists to make reliable (`bug`/`Bug`/`bugs` at
500 users). See the analysis in `10_Roadmap` (label-model study).

### 2. Label governance — hybrid "open-create, curated-mutation" (Phase 1)

Govern the *mutation* of shared state, not its *capture*:

- **Create + apply**: any org member. Capture must stay frictionless or
  labels die on the vine (the reason Jira's labels succeed). Applying a label
  to a specific issue additionally requires project MEMBER/LEAD on that
  issue's project (VIEWER cannot).
- **Rename / recolor / delete**: org **ADMIN**, or any user who is **LEAD of
  at least one project** (a trusted-curator signal). Mutating a shared label
  changes it for everyone, so it is the guarded operation.
- **Case-insensitive uniqueness** per org kills the #1 entropy source
  (`Bug` vs `bug`) cheaply — enforced by a functional unique index, not just
  a service check, so concurrent creates can't race a duplicate in.

RBAC lives behind **policy functions** (`canCreateLabel`, `canManageLabels`)
so Phase 2 can flip to a stricter "restrict creation to LEAD/ADMIN" mode via
an org setting — a config change, not a refactor. We do **not** build that
toggle now (no premature abstraction, rule #10); we only keep the seam.

> **Known limitation — accepted for MVP (revisit post-MVP):** because any
> member can create a project and instantly becomes its LEAD, the "LEAD of any
> project" curator signal in `canManageLabels` is effectively self-grantable —
> a determined member could spin up a throwaway project to gain label-management
> rights over the shared org catalog. The clean fix is **ADMIN-only management**
> (`canManageLabels` = `orgRole === "ADMIN"`), a one-line change in the policy
> function. We are **deliberately shipping the hybrid model to MVP** to learn
> from real usage whether label governance needs centralizing before locking it
> down. Tracked in the backlog. This is a governance/UX call, not a data-leak:
> tenant scope (F-1) still fully isolates orgs regardless.

### 3. Components are project-scoped, LEAD-managed

- **CRUD**: the **project LEAD** (component config is project config).
  *(Update — ADR-0024, 2026-07-23: an org ADMIN is now an effective LEAD on every
  project in its org, so admins may manage components too. The original
  "no implicit project power" clause was reversed there; see `15_roles.md`.)*
- **Apply**: any project MEMBER/LEAD on that project (VIEWER cannot).
- **Default assignee ("owner")**: a component may carry a default assignee.
  When a component is added to an issue that currently has **no assignee**, the
  issue is assigned to that person (classic Jira routing). We never *override*
  an existing assignee — the rule only fills a blank. **Naming:** the DB column
  is `leadId`, but the API/UI term is **owner** — "lead" was ambiguous against
  the project **LEAD** role (a component owner gets *no* permissions; it's purely
  a default-assignee pointer). The column is left as `leadId` to avoid a no-op
  rename migration; it's mapped to `owner` at the DTO boundary.
- **Uniqueness**: case-insensitive per project.

### 4. Cardinality — both many-to-many via join tables

`IssueLabel` exists; we add `IssueComponent` (rather than a single
`componentId` FK) so an issue can belong to several components — Jira parity
and no migration when that need lands.

## Consequences

- The Board/Backlog label filter (already plumbed to `IssueLabel`) lights up
  once labels exist; the component filter adds one `BoardFilter` field +
  one `where` clause + one control, per ADR-0008's composable-filter rule.
- Issue DTOs grow `labels[]` and `components[]` (additive, no client break).
- Soft-deleting a label/component detaches it from filters and chips but
  leaves the `IssueLabel`/`IssueComponent` history intact; a future
  cleanup/merge tool (Phase 2) reconciles.
- Deferred (logged as backlog, rule #13): label creation lockdown toggle,
  label merge, usage counts, label groups/scoping, component-based board
  swimlanes, per-project label sets.
