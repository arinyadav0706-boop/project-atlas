# Technology Stack — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

Decisions here are recorded formally in `docs/11_ADR/0002-tech-stack-selection.md`.

---

## 1. Frontend

| Choice | Why |
|---|---|
| Next.js (App Router) | Single codebase for UI + API, file-based routing, server components reduce client JS, strong Vercel deploy story, huge ecosystem for a small team to find help in |
| React 18+ | Industry-standard, matches Next.js, largest hiring/learning pool |
| TypeScript (strict) | Catches entire classes of bugs before runtime — critical safety net for a team new to this stack |
| Tailwind CSS | Utility CSS avoids maintaining a separate CSS architecture; fast to learn |
| shadcn/ui | Copy-in component primitives (not an npm black box) — the team owns and can modify every component; accessible by default (Radix) |
| React Hook Form | De facto standard form state library, integrates with Zod |
| Zod | Single schema definition shared between client validation, server validation, and TypeScript types |

## 2. Backend

| Choice | Why |
|---|---|
| Next.js Route Handlers | No second server/deploy to operate; colocated with the frontend; typed end-to-end |
| Node.js runtime | Required by Next.js; team already has some JS/TS exposure via frontend |
| TypeScript (strict, shared with frontend) | One language across the stack lowers the learning curve for a 2-person team |

## 3. Database

| Choice | Why |
|---|---|
| PostgreSQL | Relational domain (users, projects, issues, sprints) fits relational modeling; mature, free, portable across every hosting option we're considering |
| Prisma ORM | Type-safe queries generated from schema, approachable migration workflow, large ecosystem — appropriate for a team without deep SQL/ORM experience |

## 4. Authentication

| Choice | Why |
|---|---|
| Auth.js (NextAuth) | Handles OAuth/OIDC flows, session/JWT management, CSRF protection out of the box — avoids the team hand-rolling security-critical code |
| Google OAuth | Most likely existing IdP for a modern org |
| Microsoft Entra ID (OIDC) | Common enterprise IdP; required for enterprise credibility |
| Email/Password (fallback) | Bootstrap path before SSO is configured; hashed with bcrypt/argon2 |

## 5. Storage

| Choice | Why |
|---|---|
| Supabase Storage (V1 dev/initial prod) | Free/low-cost tier, S3-compatible, zero infra to stand up |
| Azure Blob Storage (future) | Target for on-prem/Azure production; abstracted behind a `StorageAdapter` interface (`shared/lib/storage/`) so switching providers is a config change, not a rewrite (NFR-8) |

## 6. Hosting

| Environment | Choice | Why |
|---|---|---|
| Local development | Docker Compose (Postgres + app) | Zero cloud dependency to develop; validates Docker portability continuously, not as an afterthought |
| Development (hosted) | Vercel + Supabase | Fastest path to a shareable environment, generous free tiers, meets < $40/mo target |
| Production (initial) | Vercel + Supabase (paid tier) | Meets < $100/mo target at 500-user scale without operating servers |
| Production (future) | Docker containers on Azure (App Service or Container Apps) + Azure Database for PostgreSQL + Azure Blob | Company-controlled infra when required by IT/security policy |

## 7. CI/CD & Tooling

| Choice | Why |
|---|---|
| GitHub Actions | Free for the required volume, integrates directly with the repo, no extra account/tool for the team to learn |
| ESLint + Prettier | Enforce `04_Coding_Standards.md` automatically |
| Vitest / Playwright (Phase 3+) | Unit + e2e testing; introduced in `docs/08_Testing/` |
| Docker + Docker Compose | Local parity with production and the path to Azure |

## 8. Explicitly Rejected (for now) and Why

| Rejected | Reason |
|---|---|
| Microservices | Operational cost not justified at this scale/team size (see Software Architecture §8) |
| Kubernetes | Overkill before there is more than one deployable unit; revisit only if Azure Container Apps/App Service prove insufficient |
| Custom-built authentication | Security-critical code should not be hand-rolled by a team new to this stack |
| MongoDB / NoSQL | Domain is relational; Postgres is the better fit |
| GraphQL | Added complexity not justified until a public API (V2) requires it |

## 9. Portability Guardrails

To honor "never tightly couple to Vercel or Supabase":

1. All Supabase usage is limited to (a) managed Postgres connection string
   and (b) Storage — both are standard protocols (Postgres wire protocol,
   S3-compatible API) with drop-in alternatives.
2. No Vercel-only APIs (e.g., Vercel KV, Vercel Cron) are used without an
   equivalent that also runs in Docker/Azure; if a Vercel-specific feature
   is ever adopted, it must be documented in an ADR with a stated fallback.
3. Environment configuration is done via `.env` variables validated at
   startup (Zod-parsed env schema) — never hard-coded provider SDKS calls
   scattered through feature code; all provider access goes through
   `shared/lib/` adapters.
