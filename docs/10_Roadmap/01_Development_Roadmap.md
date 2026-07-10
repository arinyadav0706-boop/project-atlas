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
| 4 | MVP Build — Core | Authentication, Dashboard, Projects, Issues, Board modules | Each module's acceptance criteria pass |
| 5 | MVP Build — Planning | Backlog, Sprint, Comments, Attachments modules | Each module's acceptance criteria pass |
| 6 | MVP Build — Operate | Notifications, Reports, Search, Admin, User Management, Roles, Profile | Each module's acceptance criteria pass |
| 7 | Hardening | Security review, load test to 60 concurrent users, accessibility pass, cost validation | NFRs in PRD §4 met |
| 8 | Internal GA (V1) | Deployed to production (Vercel/Supabase), team migrated off Jira Free | Success criteria in Vision §5 met |

## 2. V1 Module Delivery Order (Phases 4–6) and Rationale

1. **Authentication** — everything else requires an authenticated `actor`.
2. **Projects** — issues, board, backlog, sprint all belong to a project.
3. **Issues** — the core entity; board/backlog/sprint are views over issues.
4. **Board** — first usable end-to-end workflow (create issue → move status).
5. **Dashboard** — becomes meaningful once issues/projects exist.
6. **Backlog & Sprint** — sprint planning workflow.
7. **Comments & Attachments** — collaboration on existing issues.
8. **Notifications** — depends on events from issues/comments/sprints.
9. **Reports & Search** — depend on a populated dataset to be meaningful to build against.
10. **Admin, User Management, Roles, Profile** — can be built in parallel with the above once Authentication's RBAC model exists; sequenced last only because they're lower usage-frequency, not lower importance.

## 3. Version 2 Backlog (explicitly deferred)

Timesheets, Time Tracking, Wiki, Calendar, Gantt, Automation, Custom Fields,
Subtasks, AI Assistant, Microsoft Teams integration, GitHub integration,
public REST API, Webhooks, Knowledge Base, Analytics.

V2 also revisits: multi-tenant SaaS conversion, configurable workflows,
granular per-field permissions, Azure production migration (unless pulled
forward per Infrastructure §6 cost triggers).

## 4. Decision Checkpoints Requiring Founder Sign-off

- End of Phase 1: confirm assumptions in Vision §8 and Security §2 (A5 role
  model).
- End of Phase 2: confirm database design and API surface before Prisma
  schema is generated (schema changes after Phase 3 starts require
  migrations, not free edits).
- End of Phase 7: go/no-go for internal GA.
