# Development Roadmap — EAGLES

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

---

## 1. Program Phases

| Phase | Name | Output | Gate to next phase |
|---|---|---|---|
| 0 | Kickoff | This repository, README, folder structure | Done |
| 1 | Foundational Documentation | Product Vision, PRD, BRD, Architecture, Feature Architecture, Tech Stack, Coding Standards, Security overview, Infra overview, Roadmap, ADRs, CLAUDE.md, Cursor rules | Founders review/approve Assumptions (Vision §8, Security §2) |
| 2 | Detailed Design | Database Design + ER diagram, OpenAPI spec, UI spec, 10 per-module docs | Design docs reviewed against PRD acceptance criteria |
| 3 | Scaffolding | Next.js app skeleton, Prisma schema, Docker Compose, GitHub Actions CI, shadcn/ui setup, Auth.js wired to Google + Entra ID | `docker compose up` runs; CI green on an empty app |
| 4 | MVP Build — Core | Authentication, Home (was Dashboard), Projects, Issues, Board modules | Each module's acceptance criteria pass |
| 5 | MVP Build — Planning | Backlog, Sprint, Comments, Attachments modules | Each module's acceptance criteria pass |
| 6 | MVP Build — Operate | Notifications, Reports, Search, Admin, User Management, Roles, Profile | Each module's acceptance criteria pass |
| 7 | Hardening | Security review, load test to 60 concurrent users, accessibility pass, cost validation | NFRs in PRD §4 met |
| 8 | Internal GA (V1) | Deployed to production (Vercel/Supabase), team migrated off Jira Free | Success criteria in Vision §5 met |
| 9 | V2 Build | Subtasks, Custom Fields, Automation rules, Issue dependencies, Recurring tasks, Calendar view, Time Tracking, public REST API + Webhooks, Slack integration, GitHub integration, Wiki/Docs, multi-tenant SaaS conversion, self-hosted packaging (PRD §1a) | Each V2 feature's acceptance criteria pass; API stable before integrations are built on top of it |
| 10 | V3 Build | Portfolio/rollup views, Goals/OKR tracking, Workload view, Forms-based intake, Approval workflows, AI Assistant, Marketplace/plugin ecosystem, Advanced/granular permissions, Mobile apps (PRD §1b) | Each V3 feature's acceptance criteria pass |

## 2. V1 Module Delivery Order (Phases 4–6) and Rationale

1. **Authentication** — everything else requires an authenticated `actor`.
2. **Projects** — issues, board, backlog, sprint all belong to a project.
3. **Issues** — the core entity; board/backlog/sprint are views over issues.
4. **Board** — first usable end-to-end workflow (create issue → move status).
5. **Home** (was Dashboard) — the personal action launchpad; becomes meaningful once issues/projects exist (ADR-0012).
6. **Backlog & Sprint** — sprint planning workflow.
7. **Comments & Attachments** — collaboration on existing issues.
8. **Notifications** — depends on events from issues/comments/sprints.
9. **Reports & Search** — depend on a populated dataset to be meaningful to build against.
10. **Admin, User Management, Roles, Profile** — can be built in parallel with the above once Authentication's RBAC model exists; sequenced last only because they're lower usage-frequency, not lower importance.

## 3. Version 2 and Version 3 Scope

Full feature list, per-feature rationale ("why this version, not the
other"), and the scaling considerations each version introduces now live
in `docs/00_Product/02_Product_Requirements.md §1a` (V2) and `§1b` (V3) —
not duplicated here to avoid the two documents drifting apart. Summary:

- **V2 theme**: the most-used Jira/Asana features responsible for teams
  staying on those products instead of switching — Subtasks, Custom
  Fields, Automation rules, Issue dependencies, Recurring tasks, Calendar
  view, Time Tracking, public REST API + Webhooks, Slack integration,
  GitHub integration, Wiki/Docs — plus the ADR-0006-driven business
  scope: multi-tenant SaaS conversion and self-hosted packaging.
  **The V2 build is sequenced and expanded around a "Management Visibility
  Layer" (time tracking → teams/hierarchy → workload → dashboards → daily
  execution → views → custom workflows) in
  `docs/00_Product/05_V2_Management_Visibility_Layer.md`** — the response to
  enterprise feedback that V1 "looks basic": it lacks the workload/reporting
  insight management buys the tool for. That doc also defines the matrix
  org model (teams/reporting lines orthogonal to project membership).
- **V3 theme**: platform maturity/defensibility — Portfolio/rollup views,
  Goals/OKR tracking, Workload view, Forms-based intake, Approval
  workflows, AI Assistant, Marketplace/plugin ecosystem, advanced
  permissions, mobile apps.
- **Hard sequencing rule**: public REST API + Webhooks (V2) must ship
  before any integration built on top of it (Slack, GitHub in V2;
  Marketplace in V3) — never build an integration and its API foundation
  in parallel.
- V2 also revisits items already flagged in earlier docs: configurable
  workflows, granular per-field permissions (pulled into V3's "advanced
  permissions" instead — see PRD §1b), Azure production migration (unless
  pulled forward per Infrastructure §6 cost triggers).

Also see `docs/00_Product/04_Business_Model_and_Distribution_Strategy.md`
for what self-hosted packaging and multi-tenant conversion actually
require beyond the feature list.

## 4. Decision Checkpoints Requiring Founder Sign-off

- End of Phase 1: confirm assumptions in Vision §8 and Security §2 (A5 role
  model).
- End of Phase 2: confirm database design and API surface before Prisma
  schema is generated (schema changes after Phase 3 starts require
  migrations, not free edits).
- End of Phase 7: go/no-go for internal GA.
- Whenever the organization formally signs off on adopting EAGLES (may
  land before or after Phase 7): set `ALLOWED_EMAIL_DOMAINS` in production
  and confirm the Entra app registration is bound to the company's real
  tenant, per ADR-0005. Not gated to a specific phase since the business
  decision timeline is independent of the build timeline.
