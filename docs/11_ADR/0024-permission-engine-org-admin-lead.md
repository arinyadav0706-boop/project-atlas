# ADR-0024 — Centralized Permission Engine; Org Admins Are Effective LEAD Everywhere

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team
- Supersedes: the founder decision of 2026-07-12 recorded in `15_roles.md` BR-2
  ("org `ADMIN` carries no implicit project-level powers")

## Context

Two related problems:

1. **Project-role authorization is duplicated.** Every feature service
   (issues, board, backlog, sprints, comments, attachments, components, labels,
   projects) independently resolves the caller's project role via
   `ProjectService.getMemberRole(projectId, userId)` and re-declares the same
   predicates (`canWrite = role ∈ {MEMBER,LEAD}`, `canManage = role === LEAD`).
   The rule "what does this role permit" lives in ~9 places.

2. **The org-admin ≠ project-lead rule no longer matches how the org operates.**
   The 2026-07-12 decision kept org administration and project leadership
   strictly separate: an org `ADMIN` who wasn't a `ProjectMember` had
   viewer-only power on that project. In practice the two founders **are** the
   administrators and need to act on every project (unblock a stuck sprint, fix
   a mis-filed issue, manage membership) without being manually added as `LEAD`
   to each one. The founder has now decided **org admins should be LEAD on all
   projects in their org.**

We want both fixed together: a single place that answers "what is this actor's
effective role here," with the org-admin elevation living in that one place —
not sprinkled across 9 services.

## Decision

### 1. A centralized permission engine (`src/features/authorization`)

One module owns project-role authorization logic:

- `elevate(actor, membershipRole)` — the **one** place the elevation rule
  lives: returns `LEAD` when `actor.orgRole === "ADMIN"`, otherwise the
  membership role unchanged.
- `canWriteContent(role)` / `canManageProject(role)` — the shared role
  predicates, replacing the per-service copies.
- `PermissionService.getEffectiveProjectRole(actor, projectId)` — the async
  seam for callers that want the full resolution in one call (short-circuits to
  `LEAD` for admins, else looks up membership). This is the shared platform
  service future modules consume instead of re-deriving RBAC.

Feature services resolve the caller's role, pass it through `elevate`, and gate
on the shared predicates. The **factual** membership lookups — "is this
*assignee*/*component owner* a member?" — stay on `getMemberRole` and are
**not** elevated: elevation is an *authorization* concept ("what may the caller
do"), never a *fact* ("who is a member").

### 2. Org admins are effective LEAD on every project in their org

`elevate` grants `ADMIN` the `LEAD` role for authorization and for the
displayed `myRole`, so admins get full project powers (settings, membership,
sprints, moderation, content) everywhere — no per-project membership needed.

### 3. What elevation does NOT change (the guardrails)

- **F-1 tenant isolation is absolute.** Elevation is scoped to the actor's own
  organization. Every service still resolves and org-checks the project
  (`organizationId === actor.organizationId`) *before* role matters; an admin of
  org A is still `NotFound` on org B. Elevation never widens tenant scope.
- **The "at least one real LEAD" guard is unchanged.** Demote/remove-member
  logic counts actual `ProjectMember` LEAD *rows*; the admin's elevated role is
  virtual (no row), so it can't be the "last lead" and can't mask a project
  that has lost its real leads.
- **Membership facts are unchanged.** Admins don't appear as members they
  aren't; assignee/owner validation still requires a real membership row.

## Consequences

- The permission rule and elevation live in exactly one module; adding custom
  roles / permission inheritance (User Management Future Scope) extends the
  engine, not every service.
- Org admins can operate any project without manual membership — matching how
  the org is actually run.
- **`15_roles.md` is updated**: BR-2's "no implicit project powers" is
  superseded here; its permission matrix's "Org `ADMIN`" column now reads as
  effective `LEAD` for project-scoped actions. Tests that asserted the old
  behavior are updated in the same change.
- Trade-off accepted: an org admin is powerful by design. This is intended for a
  2-founder org; when delegated/least-privilege admin scopes land (ADR-0022
  FUT-21), "admin ⇒ lead everywhere" can itself become a capability rather than
  a hardcoded elevation — again, changed in the one engine module.
