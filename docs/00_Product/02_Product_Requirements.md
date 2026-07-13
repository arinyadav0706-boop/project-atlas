# Product Requirements Document (PRD) — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

Related: `01_Product_Vision.md`, `03_Business_Requirements.md`,
`docs/02_Modules/*` (per-module detail once authored in Phase 2).

---

## 1. Scope of Version 1 (MVP)

| # | Module | One-line scope |
|---|---|---|
| 1 | Authentication | SSO (Google, Microsoft Entra ID via OIDC) + email/password fallback, session management |
| 2 | Dashboard | Personal landing page: assigned issues, recent activity, project shortcuts |
| 3 | Projects | Create/manage projects, project settings, membership |
| 4 | Issues | Create/edit/transition issues (bug/task/story/epic), fields, labels, priority |
| 5 | Board | Kanban board per project/sprint with drag-and-drop status transitions |
| 6 | Backlog | Ordered list of unscheduled issues, ready to be pulled into a sprint |
| 7 | Sprint | Create/start/close sprints, sprint scope, burndown-ready data |
| 8 | Comments | Threaded comments on issues with mentions |
| 9 | Attachments | File upload/download on issues (Supabase Storage → Azure Blob later) |
| 10 | Notifications | In-app notifications for assignment, mention, status change |
| 11 | Reports | Basic project/sprint reports (velocity, status breakdown, cycle time) |
| 12 | Search | Global search across projects/issues (Postgres full-text) |
| 13 | Admin | Org-wide settings, project/user oversight |
| 14 | User Management | Invite/deactivate users, assign org roles |
| 15 | Roles | RBAC role definitions and assignment |
| 16 | Profile | User profile, avatar, notification preferences |

V2 and V3 scope (explicitly out of scope for V1) is detailed in §1a/§1b
below and sequenced in `docs/10_Roadmap/01_Development_Roadmap.md §3`.

## 1a. Version 2 Scope — "credible daily-driver replacement"

Theme: the features most responsible for teams staying on Jira/Asana
instead of switching — without these, V1 is a good internal MVP but not
yet a full replacement for teams with real workflow complexity.

| # | Feature | Reference product | Why it's V2, not V3 |
|---|---|---|---|
| 1 | Subtasks | Jira | Breaking Task/Story into checklist-style items is a daily-use pattern, not a power feature |
| 2 | Custom Fields | Jira | Every real team needs at least one field the MVP didn't anticipate |
| 3 | Automation rules ("when X, do Y") | Both | The single most-used power feature in both products |
| 4 | Issue dependencies (blocks/blocked-by) | Both | Needed the moment two teams' work overlaps — already flagged as Issues Future Scope in `docs/02_Modules/04_issues.md` |
| 5 | Recurring tasks | Asana | Heavily used for standing work (weekly reports, recurring reviews) |
| 6 | Calendar view | Both | Common alternate view alongside Board/Backlog |
| 7 | Time Tracking | Jira | Client billing/reporting — already an MVP-adjacent module name in the original scope |
| 8 | Public REST API + Webhooks | Both | **Prerequisite** for every integration below — build this before Slack/GitHub, not alongside |
| 9 | Slack integration | Both | The most-requested integration in both ecosystems |
| 10 | GitHub integration | Jira | Link commits/PRs to issues, auto-transition on merge |
| 11 | Wiki/Docs | Increasingly expected (Notion-adjacent) | Lightweight project documentation next to issues |
| 12 | Multi-tenant SaaS conversion | ADR-0006 (business-driven) | Tenant resolution, per-request org scoping, self-serve signup |
| 13 | Self-hosted packaging | ADR-0006 (business-driven) | Private registry, license decision, real setup wizard |

**Sequencing dependency**: #8 (API + Webhooks) must ship before #9/#10 —
Slack/GitHub integrations are built on top of the public API, not
independently of it.

**Scaling considerations introduced by V2** (not built until needed, but
worth planning for so V2 doesn't require a mid-stream redesign):
- Automation rules + webhook delivery are inherently async (a rule
  firing shouldn't block the request that triggered it) — this is where a
  background job queue (e.g., a Postgres-backed queue to start, avoiding a
  new infra dependency; revisit if volume demands Redis/BullMQ) enters the
  architecture for the first time.
- Public API introduces rate limiting as a real requirement, not optional.
- Multi-tenant conversion is the point where per-tenant query scoping
  needs an audit pass across every repository, not just new tenants added
  to existing code paths.

## 1b. Version 3 Scope — "platform maturity / defensibility"

Theme: what makes EAGLES defensible against Jira/Asana long-term, once V2
has made it a credible daily driver.

| # | Feature | Reference product | Why V3, not V2 |
|---|---|---|---|
| 1 | Portfolio / cross-project rollup view | Jira ("Advanced Roadmaps"), Asana ("Portfolios") | Needs multiple mature projects with real history to be useful |
| 2 | Goals/OKR tracking | Asana | Ties issues to company objectives — needs the reporting foundation (V1) plus API (V2) first |
| 3 | Workload/capacity view | Asana | Needs real usage data across sprints to be meaningful |
| 4 | Forms-based intake | Both | Needs the public API (V2) as its foundation |
| 5 | Approval workflows | Asana | A new task-type concept, not a small addition |
| 6 | AI Assistant (auto-summarize, suggest triage, draft descriptions) | Both racing to build this | Deliberately deferred from the original V2 wishlist — a differentiator once the core product is solid, not before; building it on an unstable core wastes the investment |
| 7 | Marketplace/plugin ecosystem | Jira's biggest moat | Long-term; needs a stable public API (V2) as a prerequisite and its own governance model |
| 8 | Advanced/granular permissions (issue-level security) | Jira | Real demand signal is self-hosted enterprise customers (ADR-0006), which is itself V2 scope |
| 9 | Mobile apps | Both | Table stakes eventually, not a blocker before V3 |

**Scaling considerations introduced by V3**:
- Portfolio/rollup views and workload views are read-heavy aggregate
  queries across many projects — likely the first real trigger for a
  caching layer or read replica, not V1/V2's straightforward per-project
  queries.
- A plugin/marketplace ecosystem introduces third-party code running
  against your data — a genuinely new security boundary, not an extension
  of existing RBAC.

## 2. Requirement Format

Every module's detailed requirements live in `docs/02_Modules/<module>.md`
(Phase 2 deliverable) using this structure per the program spec:
Overview, Business Rules, Database, API, UI, Acceptance Criteria,
Validation, Future Scope. This PRD defines the cross-cutting requirements
that apply to every module.

## 3. Cross-Cutting Functional Requirements

### FR-1 Identity & Access
- FR-1.1 Users authenticate via SSO (Google or Entra ID) or email/password.
- FR-1.2 Every authenticated request resolves to a `User` with an
  organization-level `Role` and, where applicable, a project-level role.
- FR-1.3 All mutating actions are authorized against RBAC before execution
  at the service layer (never trusted from the client).

### FR-2 Auditability
- FR-2.1 Every entity carries `createdAt`, `updatedAt`, `createdBy`,
  `updatedBy`, `deletedAt` (soft delete).
- FR-2.2 Destructive/administrative actions (role changes, project deletion,
  user deactivation) are written to an `AuditLog` table.

### FR-3 Issues & Workflow
- FR-3.1 Issues belong to exactly one project and have a type (Epic, Story,
  Task, Bug), a status drawn from the project's workflow, a priority, an
  optional assignee, and an optional sprint.
- FR-3.2 Status transitions are constrained by the project's configured
  workflow (V1 ships one default workflow: To Do → In Progress → In Review →
  Done).
- FR-3.3 Issues support comments and file attachments.

### FR-4 Sprints
- FR-4.1 A project has zero or more sprints; only one sprint per project may
  be `ACTIVE` at a time.
- FR-4.2 Starting a sprint requires a name, start date, and end date.
- FR-4.3 Closing a sprint moves incomplete issues back to the backlog (or to
  a follow-up sprint, selectable at close time).

### FR-5 Notifications
- FR-5.1 A user is notified in-app when: assigned an issue, mentioned in a
  comment, or when an issue they're assigned/watching changes status.
- FR-5.2 Notifications are marked read/unread and are queryable per user.

### FR-6 Search
- FR-6.1 Global search returns matching projects and issues the requesting
  user is authorized to see, ranked by relevance.

## 4. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Support 500 registered users, 60 concurrent, without redesign; architecture must scale to 1,000 users by scaling the app/DB tier, not by re-architecting. |
| NFR-2 | p95 API response time < 300ms for read endpoints under expected load. |
| NFR-3 | p95 page load < 1.5s for Board/Backlog views. |
| NFR-4 | 99.5% uptime target for internal production (business-hours-critical, not 24/7 SLA in V1). |
| NFR-5 | All traffic over HTTPS/TLS; secrets never committed to source control. |
| NFR-6 | Strict TypeScript (`strict: true`, no `any`) across the codebase. |
| NFR-7 | Application must run fully via `docker compose up` for local development, with no cloud dependency required to develop. |
| NFR-8 | Database and file storage providers must be swappable (Supabase → self-hosted Postgres / Azure Blob) without application-layer rewrites — enforced via repository pattern and storage adapter interface. |
| NFR-9 | Dev infra cost < $40/month; initial production infra cost < $100/month. |

## 5. Out of Scope for V1 (explicit)

- Public/partner-facing API and webhooks (V2).
- Multi-tenant signup/billing flows (V2, SaaS phase).
- Offline mode / native mobile apps.
- Real-time collaborative editing (comments/attachments are request/response,
  not CRDT-based).

## 6. Dependencies & Assumptions

See `01_Product_Vision.md §8`. Additional PRD-level assumption: V1 default
workflow (To Do → In Progress → In Review → Done) is fixed and not
per-project configurable; configurable workflows are V2 (tracked under
"Custom Fields"/workflow automation).
