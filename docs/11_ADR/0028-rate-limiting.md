# ADR-0028: Rate limiting (DB-backed, portable)

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Founding CTO

## Context

The security assessment (GL-3, finding F1) found EAGLES has **no rate limiting
anywhere** — login, mutations, and search are all unthrottled. This exposes the
platform to credential stuffing / password spraying against the credentials
provider, account/resource enumeration, search-abuse, and request-flood DoS.
This is a P0 blocker for any external deployment.

Forces:
- **Portability (ADR-0004):** feature code must not depend on a Vercel-only or
  a single-vendor SDK. A Redis/Upstash limiter would add a new external infra
  dependency and a vendor coupling we've deliberately avoided so far.
- **Serverless:** each function instance is isolated, so an in-memory counter
  does not work across instances — the limiter must share state.
- **No background infra yet:** there is no Redis and no job queue in V1 (the
  queue is planned for V2, PRD §1a). We should not introduce one for this.
- **Edge vs Node:** Next.js `middleware` runs on the Edge runtime, where Prisma
  cannot reach Postgres. So a DB-backed limiter must run in the Node runtime
  (inside Route Handlers / the auth `authorize`), not in middleware.

## Decision

Implement a **fixed-window rate limiter backed by a single Postgres table**
(`rate_limits`), applied in the Node runtime at the auth boundary and via a
reusable `enforceRateLimit()` helper in Route Handlers — no new infrastructure,
consistent with the plain-Postgres-via-Prisma portability rule.

The counter is atomic (`INSERT … ON CONFLICT (key) DO UPDATE SET count =
count + 1 RETURNING count`), keyed by `bucket:identifier:windowStart`, so
concurrent requests increment correctly. Expired rows are purged
opportunistically (a probabilistic `DELETE WHERE expiresAt < now()`), so the
table stays bounded without a cron.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Upstash/Redis token bucket | New external dependency + vendor coupling; violates ADR-0004 portability and adds infra to run/self-host. Revisit at V2 scale if DB load warrants. |
| In-memory (per-instance) counter | Serverless instances don't share memory — an attacker just spreads requests across instances. Ineffective. |
| Edge middleware limiter | Edge runtime can't use Prisma/Postgres; would still need an external store. |
| Do nothing until V2 | It's a P0 account-takeover exposure; unacceptable before external users. |

## Consequences

- **Positive:** closes the biggest pre-launch exposure (brute force) with zero
  new infra; portable across Vercel and self-hosted; atomic and correct under
  concurrency; the same helper protects any endpoint.
- **Negative / trade-offs accepted:**
  - One extra DB round-trip on limited endpoints. Mitigated by applying it to
    the endpoints that need it (auth, search, mutations) rather than every read,
    and by the pooled connection.
  - Fixed-window (not sliding-window) allows a burst at a window boundary. This
    is an accepted trade-off for V1; the window sizes are chosen conservatively.
  - `rate_limits` rows are **ephemeral operational state**, so — as an explicit,
    documented exception to the audit-fields/soft-delete convention (CLAUDE.md
    rule 9) — they carry no audit fields and are hard-deleted on expiry by
    design.
- **Follow-up actions required:**
  - Roll `enforceRateLimit()` out across all mutation Route Handlers (tracked).
  - Add account lockout / password policy / bot protection (F8, separate ADR).
  - Revisit Redis/sliding-window at V2 scale if DB contention appears.
