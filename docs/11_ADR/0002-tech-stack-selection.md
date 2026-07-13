# ADR-0002: Core Technology Stack Selection

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founding CTO (this document), pending founder ratification

## Context

We need a stack that (a) a 2-person team with ~6 months of experience can
learn and operate, (b) is portable across Vercel/Supabase and Docker/Azure,
and (c) has a large enough community/documentation base that the team and
AI tooling (Claude, Cursor) can reliably find correct, current guidance.

## Decision

Adopt: Next.js (App Router) + React + TypeScript (strict) + Tailwind CSS +
shadcn/ui + React Hook Form + Zod on the frontend; Next.js Route Handlers +
Node.js on the backend; PostgreSQL + Prisma for data; Auth.js for
authentication (Google + Microsoft Entra ID OIDC + email/password
fallback); Supabase Storage initially, Azure Blob Storage later, behind a
storage adapter interface; GitHub Actions for CI.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Remix / SvelteKit / plain Express+SPA | Smaller ecosystem/community than Next.js+React for this team to lean on; Next.js's colocated API routes reduce operational surface |
| MongoDB | Domain is strongly relational (projects → issues → sprints, users ↔ roles); Postgres + Prisma is a better structural fit and still free/portable |
| Custom-rolled authentication | Security-critical, easy to get subtly wrong; Auth.js is a maintained, widely-used library covering OAuth/OIDC/session/CSRF correctly out of the box |
| Building on a Vercel-only primitive (e.g. Vercel KV/Cron) as a core dependency | Would violate the portability requirement (must run in Docker/Azure without rewrite) |
| GraphQL API layer | No current requirement (no public API in V1); added complexity not justified yet |

## Consequences

- Positive: one language (TypeScript) end-to-end; large body of
  documentation/tutorials for a learning team; every chosen piece has a
  credible free/low-cost tier meeting the < $40/$100 monthly targets;
  Docker/Azure portability preserved by avoiding platform-specific lock-in
  primitives.
- Negative / trade-offs accepted: Next.js Route Handlers are less
  feature-rich than a dedicated API framework (e.g., NestJS) for very large
  APIs — acceptable at V1 scope; can be revisited if a public API (V2)
  demands it.
- Follow-up actions required: define the `StorageAdapter` interface and the
  Zod-validated env schema in Phase 3 so provider swaps stay config-only.
