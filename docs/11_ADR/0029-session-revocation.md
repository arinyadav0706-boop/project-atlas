# ADR-0029: Session revocation via per-request state recheck

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Founding CTO
**Relates to:** ADR-0003 (auth strategy, JWT sessions), security finding F2.

## Context

EAGLES uses stateless **JWT** sessions (ADR-0003). The role and active flag were
copied into the token at sign-in and never re-checked, and the token's default
lifetime is 30 days. Consequence (security finding F2): **deactivating a user or
changing their role has no effect until the token expires** — a fired employee
or demoted admin keeps their access for up to 30 days. Unacceptable for
enterprise (offboarding, incident response).

Stateless JWTs are attractive for scale (no session store lookup), but "can't
revoke" is exactly the property we cannot ship. We need revocation without
throwing away the JWT model or adding session-store infrastructure.

## Decision

**Re-read the caller's live account state from the database on every
authenticated request, inside the single `getActor()` choke point** — and derive
authorization (org role, active flag, tenant) from that DB read, not from the
token claims.

- `UserRepository.findActorState(userId)` — one primary-key read of
  `{ isActive, orgRole, organizationId }`.
- `getActor()` returns `null` when the user is missing or `isActive = false`
  (fail closed → treated as unauthenticated → redirected/401). Role comes from
  the DB, so promotions/demotions apply on the **next request**.
- `getActor()` is `cache()`-wrapped, so a full page render still performs the
  read once.
- Session `maxAge` is cut from 30 days to **12 hours** with a rolling
  `updateAge` of 1 hour — a secondary bound on a *stolen* token; the recheck is
  the primary control.
- Two guards funnel every route through this: `requireActor()` (reads) and
  `requireMutationActor()` (writes — adds the per-user mutation rate limit,
  ADR-0028). Because both call `getActor()`, **no route can forget revocation.**

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Server-side session store (DB/Redis) replacing JWT | Bigger change + (Redis) new infra; the recheck gives revocation while keeping the JWT model. |
| `tokenVersion` claim bumped on deactivate/role-change | Still needs a per-request DB read to compare, so no cheaper than reading the state itself — and misses out-of-band DB changes. |
| Just shorten `maxAge` | Reduces the window but doesn't *revoke*; a 12-hour access grant to a fired employee is still unacceptable. |
| Do nothing | P0 offboarding/incident-response gap. |

## Consequences

- **Positive:** deactivation and role changes take effect on the next request;
  works with the existing JWT model; one modular choke point; impossible to
  forget per-route.
- **Negative / trade-offs accepted:** one extra indexed PK read per request
  (request-cached). At high scale this can be fronted by a short-TTL in-memory
  cache of `findActorState` if it ever shows up in profiles — deferred until
  measured, to avoid premature complexity.
- **Follow-up:** the sidebar admin flag now uses the fresh `actor.orgRole`; the
  JWT still mirrors identity (name/avatar) for the top bar per ADR-0027.
