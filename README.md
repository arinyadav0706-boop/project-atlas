# EAGLES — Project Atlas

**Enterprise Agile Governance, Lifecycle & Execution System**

> Enterprise Project & Work Management Platform — a modern, cleaner,
> self-hostable alternative to Jira Free, built for a 500-person
> organization and architected to scale to SaaS without a rewrite.

---

## What this is

EAGLES is being built as a documentation-first enterprise software
program. Every architectural and product decision is written down before
code is generated. See [`docs/`](docs/README.md) for the full engineering
repository.

## Program Status

| Phase | Status |
|---|---|
| 0 — Kickoff | ✅ Done |
| 1 — Foundational Documentation | ✅ Done |
| 2 — Detailed Design (DB, API, UI, module docs) | ✅ Done |
| 3 — Scaffolding (Next.js, Prisma, Docker, CI) | ✅ Done |
| 4–6 — MVP Build | ⬜ Next |
| 7 — Hardening | ⬜ Pending |
| 8 — Internal GA | ⬜ Pending |

Full detail: [`docs/10_Roadmap/01_Development_Roadmap.md`](docs/10_Roadmap/01_Development_Roadmap.md)

## Repository Structure

```
project-atlas/
├── README.md
├── CLAUDE.md              # AI engineering rules (Claude Code)
├── .cursor/rules/          # AI engineering rules (Cursor)
├── docs/                   # All engineering documentation (see docs/README.md)
├── diagrams/               # Shared/large Mermaid diagrams
├── templates/              # ADR + module doc templates
├── assets/                 # Static assets for docs
├── src/                    # Application source (Next.js App Router, feature-first)
├── prisma/                 # Prisma schema + seed script
├── docker/                 # Dockerfile + docker-compose
└── .github/workflows/      # CI (lint/typecheck/build)
```

## Getting Started

```bash
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, OAuth credentials
npm install
npm run prisma:generate
npm run dev                  # or: docker compose -f docker/docker-compose.yml up
```

First-run bootstrap (creates the one Organization row + first ADMIN — see
`docs/02_Modules/01_authentication.md` BR-2):

```bash
SEED_ADMIN_EMAIL=you@example.com npm run prisma:seed
```

Only the app shell and Auth.js wiring exist so far (Phase 3 scaffolding).
Feature modules (Projects, Issues, Board, etc.) are built in Phase 4+
against the docs in `docs/02_Modules/`.

## Tech Stack

**Frontend:** Next.js (App Router) · React · TypeScript (strict) ·
Tailwind CSS · shadcn/ui · React Hook Form · Zod
**Backend:** Next.js Route Handlers · Node.js · TypeScript
**Database:** PostgreSQL · Prisma ORM
**Auth:** Auth.js — Google OAuth · Microsoft Entra ID (OIDC) ·
email/password fallback
**Storage:** Supabase Storage → Azure Blob Storage (behind a portable
adapter interface)
**Hosting:** Vercel + Supabase (dev/initial prod) → Docker on Azure
(future production), validated continuously via Docker Compose locally

Full rationale for every choice: [`docs/01_Architecture/03_Technology_Stack.md`](docs/01_Architecture/03_Technology_Stack.md)
and the ADRs in [`docs/11_ADR/`](docs/11_ADR/README.md).

## Architecture

Feature-first modular monolith — one deploy unit, organized by product
feature (`projects`, `issues`, `board`, `sprint`, ...), each layered
UI → hooks → API → service → repository. Not microservices, not
layer-first. See [`docs/01_Architecture/`](docs/01_Architecture/README.md)
for the full picture and [`docs/11_ADR/0001-feature-first-modular-monolith.md`](docs/11_ADR/0001-feature-first-modular-monolith.md)
for why.

## MVP Modules (V1)

Authentication · Dashboard · Projects · Issues · Board · Backlog · Sprint ·
Comments · Attachments · Notifications · Reports · Search · Admin ·
User Management · Roles · Profile

Deferred to V2: Timesheets, Time Tracking, Wiki, Calendar, Gantt,
Automation, Custom Fields, Subtasks, AI Assistant, Microsoft Teams,
GitHub integration, public REST API, Webhooks, Knowledge Base, Analytics.

## Documentation Status

- [x] Product Vision
- [x] Product Requirements (PRD)
- [x] Business Requirements (BRD)
- [x] Software Architecture
- [x] Feature Architecture
- [x] Technology Stack
- [x] Coding Standards
- [x] Security Architecture (overview)
- [x] Infrastructure Overview
- [x] Development Roadmap
- [x] Architecture Decision Records (0001–0005)
- [x] AI Context (Claude/Cursor rules)
- [x] Database Design + ER Diagram
- [x] API Specification (OpenAPI)
- [x] UI Specification (design principles + screens/IA)
- [x] Per-module docs (16 modules)

## Cost Targets

Development: **< $40/month** · Production (initial): **< $100/month**

## AI Engineering Team

| Role | Tool |
|---|---|
| Founding CTO | Claude / Claude Code |
| Chief Architect | ChatGPT |
| Senior Software Engineer | Cursor |
| Version Control | GitHub |

Rules governing AI-assisted contributions: [`CLAUDE.md`](CLAUDE.md),
[`.cursor/rules/project-atlas.mdc`](.cursor/rules/project-atlas.mdc), and
[`docs/09_AI_Context/`](docs/09_AI_Context/README.md).
