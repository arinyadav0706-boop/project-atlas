# ADR-0004: Hosting/Storage Strategy — Vercel+Supabase Now, Docker+Azure Portable Path

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founding CTO (this document), pending founder ratification

## Context

The team needs to move fast now (Vercel + Supabase offer the fastest path
to a working, low-cost hosted environment) but the business requirement
(BRD BO-3) is to avoid vendor lock-in and retain a credible path to
company-controlled Azure infrastructure without an application rewrite.

## Decision

Use Vercel (app hosting) + Supabase (PostgreSQL + Storage) for local
development's hosted counterpart and initial production. Simultaneously
maintain a Docker Compose setup that runs the identical application against
a plain PostgreSQL container, validated continuously in local development
— not built only when the Azure migration happens. All storage access goes
through a `StorageAdapter` interface so the concrete provider (Supabase
Storage vs. Azure Blob) is a configuration/implementation swap, not a
feature-code change. The application connects to Postgres via the standard
Postgres wire protocol/connection string, never a Supabase-specific SDK, so
`Organization`/data can be migrated with standard `pg_dump`/`pg_restore`.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Build directly on Azure from day one | Slower initial iteration speed and higher setup complexity than this team should take on before the product itself is validated internally |
| Use Supabase's client SDK/features (e.g., Supabase Auth, realtime) beyond Postgres+Storage | Would deepen Supabase-specific coupling; Auth.js already covers authentication (ADR-0003), and realtime is not a V1 requirement |
| Defer Docker Compose until the Azure migration is actually needed | Risks discovering portability problems only at migration time, under time pressure; validating continuously in local dev is nearly free and de-risks the future migration |

## Consequences

- Positive: fast initial iteration on Vercel/Supabase; Azure migration
  path is a hosting/config change validated continuously via Docker
  Compose, not a one-time risky project; meets cost targets today.
- Negative / trade-offs accepted: slightly more upfront discipline required
  (storage adapter interface, avoiding Supabase-specific SDK features)
  compared to using Supabase's full feature set directly.
- Follow-up actions required: Phase 3 must implement `Dockerfile` +
  `docker-compose.yml` alongside the Vercel deployment config, not after
  it; `StorageAdapter` interface defined before any feature uses file
  upload (Attachments module).
