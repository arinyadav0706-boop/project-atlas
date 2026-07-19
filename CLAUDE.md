# CLAUDE.md — Project Atlas / EAGLES

This file governs how Claude (and Claude Code) should work in this
repository. Read this before making changes.

## What this project is

EAGLES is an enterprise work-management platform (internal Jira Free
replacement) for a 500-person organization, built by a 2-founder team new
to this stack. Full context: `docs/00_Product/`, `docs/01_Architecture/`.

## Non-negotiable rules

1. **Documentation before code.** Never implement a feature that doesn't
   have a corresponding module doc in `docs/02_Modules/` (Overview,
   Business Rules, Database, API, UI, Acceptance Criteria, Validation,
   Future Scope). If the doc doesn't exist yet, write/update it first.
2. **Never invent database tables, fields, or APIs.** The schema is defined
   in `docs/03_Database/` and `prisma/schema.prisma`; the API surface is
   defined in `docs/04_API/openapi.yaml`. If a task needs something that
   isn't there, propose the addition as a doc change first, flag it to the
   user, don't silently add it to code.
3. **Feature-first architecture only.** New code goes in
   `src/features/<feature>/{components,hooks,services,repositories,validation,types,api}`.
   Never create top-level `controllers/`, `models/`, or a generic `utils/`
   dumping ground. See `docs/01_Architecture/02_Feature_Architecture.md`.
4. **Repository pattern is mandatory.** Prisma is imported only inside
   `*.repository.ts` files. Route Handlers call services; services call
   repositories. Never let a Route Handler or React component import
   Prisma directly.
5. **RBAC is enforced server-side, in the service layer, always.** Never
   trust a client-side role check as a security boundary.
6. **Strict TypeScript, no `any`.** See
   `docs/01_Architecture/04_Coding_Standards.md`.
7. **Validate everything external with Zod.** One schema per
   action/entity, shared between client form validation and server
   validation.
8. **Stay portable.** Don't introduce a Vercel-only or Supabase-SDK-only
   dependency into feature code. Database access is plain Postgres via
   Prisma; file storage goes through the `StorageAdapter` interface. See
   ADR-0004.
9. **Every entity has audit fields.** `createdAt`, `updatedAt`,
   `createdBy`, `updatedBy`, `deletedAt` (soft delete) — no hard deletes
   from application code.
10. **No premature abstraction, no unused scaffolding.** Build what the
    current module doc/PRD requires; don't add speculative flexibility for
    hypothetical V2 features beyond what's already flagged in the docs
    (e.g., the `Organization` table exists now for future multi-tenancy,
    but don't build tenant-switching UI in V1).
11. **Comments explain why, not what.** No docstring padding, no restating
    the code in prose.
12. **When requirements are ambiguous or a decision would be
    hard-to-reverse (schema shape, auth provider behavior, RBAC model),
    stop and ask, or write/flag an ADR — don't guess silently.**
13. **Log every deferral.** Anything consciously left "for later" — a
    shortcut, a known gap, a polish item, a scale concern — gets an entry in
    `docs/10_Roadmap/02_Backlog_and_Tech_Debt.md` in the same change. Nothing
    ships to production with an open 🚩 Go-live item there.

## Where to look first

| Question | Doc |
|---|---|
| What are we building and why? | `docs/00_Product/01_Product_Vision.md` |
| What's in scope for V1 vs. V2? | `docs/00_Product/02_Product_Requirements.md` |
| How is the codebase organized? | `docs/01_Architecture/02_Feature_Architecture.md` |
| Why was X technology/approach chosen? | `docs/11_ADR/` |
| What's the database schema? | `docs/03_Database/` (Phase 2) + `prisma/schema.prisma` |
| What's the API contract? | `docs/04_API/openapi.yaml` (Phase 2) |
| What are this module's business rules? | `docs/02_Modules/<module>.md` (Phase 2) |
| What's the current program phase / what's next? | `docs/10_Roadmap/01_Development_Roadmap.md` |
| What have we deferred / what's the go-live checklist? | `docs/10_Roadmap/02_Backlog_and_Tech_Debt.md` |
| How do we keep it fast/scalable? (pagination, indexes, budgets) | `docs/01_Architecture/05_Performance_and_Scalability.md` |

## Commit style

Conventional commits: `feat(issues): ...`, `fix(auth): ...`,
`docs(architecture): ...`. Reference the module doc a change implements
where applicable.
