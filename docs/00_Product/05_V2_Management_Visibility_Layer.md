# EAGLES V2 — The Management Visibility Layer

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-29
**Companion to:** `02_Product_Requirements.md` §1a (V2 scope), `01_Product_Vision.md`

## Why this document exists

V1 is a solid **task tracker** (projects, issues, board, backlog, sprints,
comments, attachments, search, admin, RBAC). Early enterprise feedback: *"it
looks basic."* The honest diagnosis — EAGLES answers *"what are the tasks?"* but
not the questions the people who **buy** the tool actually ask:

- Who is overloaded, and who is idle?
- Are we on track — how fast is the team moving?
- What did this person / team actually do this week?
- What's due today, and by whom?

The gap between "basic task tracker" and "tool management champions" is a
**visibility/insight layer**. V2 builds it. This is not feature-chasing: it is
the smallest set of capabilities that turns EAGLES into something a manager and
a CEO open every day.

## The organizing principle: build bottom-up, per level

Model the real work lifecycle and give **every level the view it needs**. This
table is the product vision:

| Level | The question they ask | What V2 gives them |
|---|---|---|
| Developer / intern | "What do I do *today*?" | **My Day** list, **subtasks/checklists**, **estimates**, start→due dates (incl. same-day) |
| Team lead | "Is my project on track?" | **Time tracking** (estimate vs actual), sprint burndown/velocity |
| Manager | "Who's overloaded? What did my team do?" | **Workload/capacity view**, **team reports**, **reporting hierarchy** |
| Exec / CEO | "Are we delivering?" | **Dashboards** — throughput, cycle time, status rollups across teams |

Everything below is powered by two new primitives: **effort/time data on tasks**
and an **org (people) model** alongside the existing project (work) model.

---

## 1. The org model — teams, reporting lines, and matrixed people

> Answers the concrete question: *Manager A has a 20-person team (A1…A20). Those
> people are spread across projects X, Y, Z. The lead of X must see A1's progress
> in X; Manager A must see all of A1…A20 across every project. How?*

**EAGLES is a matrix org.** Keep two axes **orthogonal** — this is the whole
design:

### Axis 1 — Work (already exists): `ProjectMember`
`(userId, projectId, role: LEAD|MEMBER|VIEWER)`. "Who works on what." A1 can be a
MEMBER of X, Y, and Z simultaneously. A **project lead sees everyone assigned in
that project** — so the lead of X already sees A1's issues in X (project scope +
assignee filter). No change needed for that half of the question.

### Axis 2 — People (new): `Team` + reporting line
```
Team        { id, organizationId, name, managerId (User), parentTeamId? (nullable) }
TeamMember  { teamId, userId }        // a user belongs to one team (V2)
```
- `managerId` = the team's manager (A). `parentTeamId` makes teams **nestable**
  (A's team → A's manager's org → director), so rollups work up the chain later.
- This axis is **independent of projects**: A1 belongs to Team A (one reporting
  line) but works on X/Y/Z (many projects).

### Visibility: who sees whose progress
A **third authorization axis** beyond org role and project role — a
**management relationship**:

- A **manager sees the assigned work of their reports (direct + descendants via
  `parentTeamId`) across ALL projects**, read-only — *even projects the manager
  is not a member of*. Scope is **report-scoped**: the manager sees their
  people's tasks (title, project, status, due, estimate/logged) and aggregates,
  **not** the full project context (other members' tasks, settings).
- Still **org-scoped (F-1 holds)** — a manager never crosses tenants.
- Implemented as a predicate in the permission engine (like the org-admin
  `elevate()` in ADR-0024), and **audited**. This is a hard-to-reverse RBAC
  decision → **ADR required** before building.

### How the two questions resolve
| Question | Mechanism |
|---|---|
| Lead of X sees A1's progress in X | Existing project scope + assignee filter |
| Manager A sees A1…A20 across X/Y/Z | New management-relationship read + **Workload view** aggregating issues by assignee for the team, across projects |

This is exactly how Jira (Teams + Plans), Asana (Teams + Portfolios), and
ClickUp (Workload) model it — proven, and it fits our existing project-scoping
cleanly.

---

## 2. V2 epics, prioritized

Ordered so each unlocks the next. Each is a feature module under
`src/features/<feature>/` per Feature Architecture — repository pattern, RBAC in
the service layer, Zod validation, portable (ADR-0004). Docs-first (a module
spec + ADRs) before code, per CLAUDE.md.

### Epic 1 — Time & effort tracking *(the keystone)*
- **What:** `estimateMinutes` on issues; a `WorkLog` (issueId, userId, minutes,
  loggedAt, note). Estimate vs actual.
- **Why first:** you cannot show workload or meaningful reports without effort
  data. Everything management wants depends on this.
- **Touchpoints:** Issue schema (+`estimateMinutes`), new `WorkLog` model, issue
  detail UI, DTOs. Additive migration.

### Epic 2 — Teams & reporting hierarchy + Manager role
- **What:** `Team`/`TeamMember` models (§1), a **Manager** capability, the
  management-relationship read predicate in the permission engine, admin UI to
  build teams and assign managers.
- **Why here:** the people axis + visibility that powers the Workload view and
  manager reports.
- **ADRs:** org/team model; management-visibility RBAC axis.

### Epic 3 — Workload / capacity view *(the "not basic" moment)*
- **What:** per-person and per-team view — assigned open work (count, points,
  estimated vs logged hours) vs capacity; **overload/idle flags**; filter by
  team/project/sprint; a heatmap.
- **Why:** the single feature your CEO named. Turns EAGLES into a management
  tool. Depends on Epics 1 + 2.

### Epic 4 — Dashboards & reports
- **What:** burndown/velocity (nearly derivable from sprints today), throughput,
  cycle time, status breakdowns, per-person/per-team/per-project. A composable
  dashboard surface (builds on the existing `reports` feature).
- **Why:** the "depth" that makes the product *look* and *be* serious to execs.

### Epic 5 — Daily execution (bottom-up)
- **What:** **My Day** (personal "due/started today" list + quick plan),
  **subtasks** (parent/child issues) + lightweight **checklists**, start/due
  dates surfaced everywhere. Makes daily standups trivial.
- **Why:** the developer/intern layer; also feeds accurate workload.

### Epic 6 — Views: List, Timeline/Gantt, Calendar
- **What:** a **List** (sortable/inline-edit table — Asana's default), a
  **Timeline/Gantt** ("waterfall" chart — pairs with dependencies), a
  **Calendar**. Same data, multiple lenses.
- **Why:** ClickUp-style flexibility — valuable, but only after the visibility
  layer exists.

### Epic 7 — Custom fields, statuses & workflows
- **What:** per-project custom statuses/workflows and custom fields (V1 has a
  fixed 3-status enum). Lets each team model its own process.
- **Why:** removes the "too rigid" objection; large, so sequenced after the
  visibility wins land.

*(Platform items already in PRD §1a — public REST API + webhooks, then
Slack/GitHub/GitLab/Teams integrations, then multi-tenant SaaS + self-hosted
packaging — follow Epic 7. API-before-integrations rule still holds.)*

---

## 3. Release slices (how we ship value early)

1. **Slice A — "Management can see effort":** Epic 1 (time) → Epic 3 skeleton
   (workload by assignee, single project). First visible "not basic" win.
2. **Slice B — "Management sees their org":** Epic 2 (teams/hierarchy) → Epic 3
   full (cross-project workload for a manager's team) → Epic 4 (core dashboards).
   This slice is the CEO's demo.
3. **Slice C — "Every level has their view":** Epic 5 (My Day/subtasks) → Epic 6
   (List/Timeline/Calendar).
4. **Slice D — "Teams model their own process":** Epic 7 (custom fields/workflows).
5. **Slice E — Platform:** API + webhooks → integrations → SaaS/self-host.

## 4. Deliberately OUT of scope (anti-bloat)

We take ClickUp's *good* ideas, not its sprawl. **Not** building in V2: chat/
docs/whiteboards/email-client, goal-cascade OKRs (V3), forms intake (V3), native
mobile apps (V3), AI assistant (V3, deliberately deferred per PRD §1b). Our edge
is **clean, fast, secure, self-hostable** — not maximal surface area.

## 5. Architecture & non-negotiables (unchanged)

- Feature-first modules; Prisma only in `*.repository.ts`; RBAC enforced
  server-side in the service layer; Zod for all external input; audit fields +
  soft delete on every entity; portable (no vendor-only deps); docs + ADR before
  code. The management-visibility predicate lives in the **permission engine**
  (one place), never duplicated.
- New async needs (report pre-aggregation, if any) use the planned Postgres-
  backed job queue (PRD §1a scaling note), not new infra.

## 6. ADRs required before building

1. **Org/Team model** — teams, `parentTeamId` nesting, one-team-per-user in V2.
2. **Management-visibility RBAC axis** — report-scoped, cross-project, org-bound,
   audited; how it composes with `elevate()`.
3. **Time-tracking model** — `WorkLog` shape, estimate semantics, rounding.
4. **Custom fields/workflows** (Epic 7) — storage strategy (typed columns vs
   EAV vs JSONB) and its query/perf implications.

## 7. What "not basic" looks like (success criteria)

- A manager opens EAGLES and immediately sees their team's workload and who's
  overloaded — **without building a report.**
- An exec sees delivery trends (throughput/cycle time) across teams on one
  dashboard.
- A developer plans their day in EAGLES instead of a notebook.
- The demo that made the CEO say "basic" now answers every question he raised.
