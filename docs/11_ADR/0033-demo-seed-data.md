# ADR-0033: Demo / seed data as a single deletable organization

**Status:** Accepted
**Date:** 2026-08-05
**Deciders:** Founders (Arin), acting CTO

## Context

EAGLES demos to stakeholders (and its own dogfooding) currently run against
an almost-empty database: one org, a handful of test users, one sample
project. An empty work-management tool always *looks* basic — a board with
four cards reads as a toy, not as a Jira replacement. Two forces converge:

1. **Sales / stakeholder confidence.** The product needs to be shown against
   a realistic company — a full org chart, many people, several projects of
   different shapes, thousands of issues across the whole workflow — for its
   depth (hierarchy, RBAC, search, backlog, sprints, time tracking) to be
   visible at all.
2. **Dogfooding at scale.** Features like manager visibility (ADR-0032),
   keyset pagination, search (GIN/tsvector), the board, and the Home
   attention widgets behave differently at 5 rows vs. thousands. A realistic
   dataset is the cheapest way to surface performance and UX gaps before a
   client does.

We want this **without new infrastructure or spend** — it must run against
the existing Supabase Postgres and be visible in the app on Vercel, at zero
additional cost. And it must be trivially removable before any client
handover, with no risk to their real data.

The existing `prisma/seed.ts` (GL-1) is a *bootstrap* seed: it mints the one
real admin and, in non-prod, a tiny demo team for local RBAC testing. It is
deliberately small and credential-safe. It is **not** the right vehicle for a
7,000–8,000-issue demo company, and must remain the minimal bootstrap.

## Decision

Ship a **separate, self-contained demo seed** (`prisma/verus/`) that
generates a single, richly-populated demo **Organization named "VERUS"** —
~150 people, ~18 teams nested 4–5 levels, 4 projects of different shapes, and
~7,000–8,500 issues with epics, components, sprints, comments, work logs, and
Home signals — writing rows **directly** via batched `createMany`, scoped
entirely to that one org so that teardown is a single scoped cascade.

Concretely:

- **One org, deletable in one command.** All demo rows hang off the VERUS
  org (fixed id `verus-demo-org`). `npm run seed:verus:teardown` deletes them
  in FK-safe order; nothing else in the database is touched. "Cleanup before
  handover" therefore means *"never run the seed against the client's
  database"* — the client starts empty — not a delete-at-the-end chore.
- **Bulk insert, not the service layer.** At ~8k issues, driving creation
  through the service layer means ~8k+ sequential round-trips to Supabase
  (Mumbai) plus dependent writes — minutes-to-hours and connection-limit
  pressure. Instead we `createMany` in batches with **correctly
  pre-computed** ranks (via the shared `ranksBetween` utility) and audit
  fields, producing rows byte-identical to what the services would write. The
  service layer's correctness is already proven by the integration suite; the
  seed's job is realistic *data*, not re-testing the stack.
- **Deterministic.** A seeded PRNG makes every run produce the same VERUS, so
  demos are reproducible and re-running is idempotent (teardown-then-seed).
- **Explicit, un-footgunnable gate.** The seed refuses to run unless
  `SEED_VERUS=confirm` (or `--confirm`) is passed, because it is *designed* to
  run against the live Supabase DB and so cannot rely on the `NODE_ENV`
  guard the bootstrap seed uses. It only ever creates/deletes the VERUS org.
- **Login model.** The demo owner's real Google account
  (`arinyadav0706@gmail.com`) is seeded as a VERUS org ADMIN (SSO login). A
  second admin (`arin.yadav2021a@vitalumn.ac.in`) is seeded with a bcrypt
  password hash for credentials login, so the owner can sign in without SSO.
  The password is printed by the seed, never committed.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Extend `prisma/seed.ts` to generate the big dataset | Conflates the credential-safe bootstrap with a large, prod-targeted demo; muddies the GL-1 safety story. Keep them separate. |
| Create the demo work through the service layer for full fidelity | Correct at small N; at ~8k issues it's minutes-to-hours of sequential network round-trips and risks Supabase connection limits. Integration tests already prove the service layer; bulk insert with pre-computed ranks yields identical rows far faster. |
| Insert demo data into the owner's existing org, delete later | Mixes demo and real rows in one org; "cleanup" becomes an error-prone hunt-and-delete. One dedicated org makes teardown a single scoped operation. |
| A separate hosted "sandbox" instance | New infrastructure and spend for a product whose commercial success is still unproven — explicitly out of scope for now (may revisit). |
| Manual creation via the UI | 150 people + ~8k issues by hand is infeasible and non-reproducible — the whole point is automation. |

## Consequences

- **Positive:**
  - A convincing demo company that shows EAGLES' real depth, on existing
    infra, at zero extra cost.
  - A genuine at-scale dogfood: pagination, search, board, and manager
    visibility exercised against thousands of rows.
  - Teardown is one command; client databases are never polluted.
  - The seed script stays in the repo permanently as a reusable
    demo/onboarding/perf tool — only the *rows* are environment-specific.
- **Negative / trade-offs accepted:**
  - Bulk insert bypasses the service layer, so the seed must itself hold
    invariants the services normally enforce (per-column unique ranks,
    per-project issue keys, `issueKeyCounter`, one-team-per-user, no epic
    nesting). These are asserted in a post-seed self-check.
  - The demo owner's Google account becomes a member of VERUS (a user
    belongs to exactly one org; no org-switching UI exists — ADR rule 10),
    so their prior test org is left behind. Accepted: it held only test data.
  - A known password exists for the credentials admin. Accepted: it is the
    owner's own account on a demo org, the hash-only value is stored, and the
    plaintext is surfaced once to the owner, never committed.
- **Follow-up actions required:**
  - Backlog entry logging that VERUS demo data must be absent from any client
    handover DB (rule #13).
  - If a future stress project (~2–4k issues in one project purely to probe
    limits) is wanted, add it as another deletable project behind a flag.
