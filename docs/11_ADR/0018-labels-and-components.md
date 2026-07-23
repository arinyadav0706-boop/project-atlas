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

### 3. Components are project-scoped, LEAD-managed

- **CRUD**: the **project LEAD** (component config is project config; org
  ADMIN carries no implicit project power — founder decision, `15_roles.md`).
- **Apply**: any project MEMBER/LEAD on that project (VIEWER cannot).
- **Default assignee**: a component may carry `leadId`. When a component is
  added to an issue that currently has **no assignee**, the issue is assigned
  to that lead (classic Jira routing). We never *override* an existing
  assignee — the rule only fills a blank.
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
