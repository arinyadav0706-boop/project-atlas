# Product Vision — EAGLES (Project Atlas)

**Status:** Draft v1.0
**Owner:** Founding CTO
**Last Updated:** 2026-07-10

---

## 1. Vision Statement

EAGLES (Enterprise Agile Governance, Lifecycle & Execution System) is a modern,
self-hostable enterprise work-management platform that gives a 500-person
organization everything Jira Free provides today — projects, issues, boards,
backlogs, sprints — with a cleaner UX, a simpler architecture, and no per-seat
licensing cost, while remaining architecturally ready to become a
multi-tenant SaaS product without a rewrite.

We are not cloning Jira feature-for-feature. We are building the smallest
coherent system that lets an internal engineering/product organization plan,
track, and ship work, and we are building it so it can be understood,
operated, and extended by a two-person founding team with ~6 months of
software experience.

## 2. Problem Statement

- Jira Free/Cloud is expensive at scale, has a heavy and cluttered UI, and
  couples the organization to Atlassian's roadmap and pricing.
- Internal teams need issue tracking, sprint planning, and reporting without
  operating a Java monolith (Jira Data Center) or paying per-seat SaaS fees.
- The founding team needs a system whose entire stack (frontend, backend,
  database, auth, hosting) is simple enough to be operated and debugged by a
  small team, while still meeting enterprise expectations (RBAC, audit
  trails, SSO via Entra ID/Google).

## 3. Product Positioning

| Dimension | Position |
|---|---|
| Category | Enterprise work management / issue tracking |
| Comparable products | Jira Free, Linear, Notion (project views) |
| Differentiation | Simpler data model, modern UI, transparent architecture, no vendor lock-in, AI-native engineering process |
| Primary deployment | Internal, single-tenant (one company) for V1 |
| Future deployment | Multi-tenant SaaS (V2+), same codebase, no redesign |

## 4. Target Users (V1)

- **Organization size:** 450–500 employees (single company/tenant).
- **Concurrency:** 20–60 concurrent active users at any time.
- **Primary personas:**
  - **Contributor** — creates/updates issues, works the board, comments.
  - **Project Lead** — manages a project's backlog, sprints, and board configuration.
  - **Admin** — manages users, roles, and org-wide settings.
  - **Viewer/Stakeholder** — read-only access to dashboards and reports.

## 5. Success Criteria for Version 1

1. Replaces Jira Free for all internal teams: projects, issues, board,
   backlog, sprints, comments, attachments, notifications, search, reports.
2. Supports 500 registered users and 60 concurrent users with p95 page loads
   under 1.5s on the primary board/backlog views.
3. RBAC-enforced, audit-logged, SSO-capable (Google + Microsoft Entra ID via
   OIDC).
4. Runs locally via Docker Compose, deploys to Vercel/Supabase in
   development, and is portable to Azure + Azure Database for PostgreSQL +
   Azure Blob Storage without architectural change.
5. Codebase is feature-first, strictly typed, documented, and can be
   understood by a new engineer from `docs/` alone.
6. Monthly cost stays under $40 in development and under $100 in the initial
   production deployment.

## 6. Non-Goals (V1)

- Multi-tenant SaaS onboarding (self-serve signup, billing) — deferred to V2.
- Advanced automation rules engine, Gantt charts, wiki, timesheets — V2 scope.
- Mobile native apps — responsive web only in V1.
- Full-text search at scale (e.g., Elasticsearch) — V1 uses PostgreSQL
  full-text search; revisit if usage demands it.

## 7. Guiding Principles

Simple. Fast. Maintainable. Secure. Modern. Portable. AI-first engineering.
Feature-first architecture. Documentation-first process. See
`docs/01_Architecture/01_Software_Architecture.md` for how these principles
are enforced in the codebase.

## 8. Key Assumptions (to be confirmed by founders)

> These are working assumptions made to keep V1 scoped and unblocked. They
> must be explicitly confirmed or revised by the founders before Phase 3
> (implementation) locks in the data model.

- A1: V1 is single-tenant (one `Organization` row), but the schema includes
  an `Organization` entity from day one so multi-tenancy in V2 is additive,
  not a migration/rewrite.
- A2: Authentication in V1 uses Google Workspace and/or Microsoft Entra ID
  SSO as the primary login method; email/password is a fallback, not the
  primary flow.
- A3: One employee = one user account = one email address (no shared
  accounts, no external/guest collaborators in V1).
- A4: Projects are visible to all authenticated employees by default
  (internal tool), with the option to restrict a project to specific members
  — full per-field permission granularity is V2 scope.
