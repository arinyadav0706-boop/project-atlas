# Self-Hosted Client Lifecycle — EAGLES

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-11

How a self-hosted (on-premise/licensed) customer deployment works, end to
end. Companion to `docs/00_Product/04_Business_Model_and_Distribution_Strategy.md`
(the business model) and ADR-0006 (the decision). This document is the
operational answer to: *"if a customer says 'give EAGLES to us,' what do
we actually give them, where do the server/database come from, and who
creates the schema?"*

---

## The Core Idea

> **We ship one sealed box (the Docker image). The customer supplies the
> electricity and plumbing (server + database). The box knows how to set
> itself up.**

We never hand over source code (this repository stays private), never
touch the customer's infrastructure, and never manage their deployment
day-to-day. Our only ongoing obligation is publishing good releases.

## Lifecycle Walkthrough (example customer: "TechCorp")

### Step 1 — The sale
TechCorp signs the license. We grant their account pull-access to our
**private container registry** (a private app store only paying customers
can download from). They never see the GitHub repo.

### Step 2 — They provision infrastructure (their job, not ours)
Their DevOps team stands up:

- **A server** — a VM or container service on *their* cloud (AWS, Azure,
  their own datacenter — Docker makes us indifferent to which). This
  plays the role Vercel plays in our own hosted deployment: it is simply
  "a computer that runs our app."
- **A PostgreSQL database** — their cloud's managed Postgres (AWS RDS,
  Azure Database for PostgreSQL) or one they run themselves.
  **Completely empty** — just a blank database with credentials.

### Step 3 — They configure and start it
We provide a `docker-compose.yml` and a documented settings list. Their
DevOps fills in a config file (the same `.env` pattern the codebase
already uses — see `.env.example`):

| Setting | Value |
|---|---|
| `DATABASE_URL` | their empty Postgres |
| `NEXTAUTH_SECRET` | a secret they generate |
| Google / Microsoft Entra credentials | **their** company tenant — their employees sign in with their own corporate accounts, not ours |

Then: `docker compose up`. That is the entirety of their install work.

### Step 4 — Who creates the tables/relations? Nobody, manually.
**The Prisma migration files are baked inside the Docker image.**
Migrations are recorded instructions — "create the users table, create
the projects table, link issues to projects…" — generated once, by us,
from `prisma/schema.prisma`. On first start against an empty database,
the container runs `prisma migrate deploy` and builds every table,
column, and relation, identical to ours, in seconds. The customer's DBA
writes zero SQL. We never connect to their database.

> **Status: wired.** The image's entrypoint (`docker/entrypoint.sh`)
> runs `prisma migrate deploy` before starting the app, and skips
> gracefully if no migrations exist yet (the repo's pre-first-migration
> state). Verified by exercising both entrypoint branches in a simulated
> image layout; the full `docker build` is confirmed the first time the
> image is actually built (no Docker daemon in the authoring
> environment).

### Step 5 — First run
A setup wizard (V2 scope) asks: organization name? first admin email?
That creates their `Organization` row and first `ADMIN` — the same
bootstrap `prisma/seed.ts` performs today, as a guided screen instead of
a terminal command.

### Step 6 — Daily life
Their employees use `eagles.techcorp.com` (their domain, their DNS, their
TLS). All data lives in their Postgres on their infrastructure. We see
nothing, host nothing, pay for nothing. If their server fails at 2am,
that is their DevOps pager — that separation of responsibility is
precisely what a self-hosted customer is buying.

### Step 7 — Upgrades
We publish `eagles:1.3` to the registry with release notes. Whenever
*they* choose (enterprises want controlled update timing — never
auto-push without their consent): pull the new image, restart. The new
container detects their schema is at 1.2, runs only the *new* migrations
("add the subtasks table"), and comes up on 1.3 — data untouched, tables
upgraded in place. One command, minutes, zero involvement from us.

## Who Provides What

| Piece | Us | Customer |
|---|---|---|
| Application code | ✅ sealed inside the image | — |
| Prisma + migration files | ✅ inside the image | — |
| Schema/tables/relations | ✅ created *automatically by* the image… | …*inside* their empty database |
| Server (the "Vercel" role) | — | ✅ their VM/cloud |
| PostgreSQL database | — | ✅ theirs, empty at start |
| Domain, HTTPS/TLS | — | ✅ theirs |
| Login (Google/Microsoft SSO) | — | ✅ their company tenant |
| Updates | ✅ we publish versions | ✅ they pull when ready |
| 2am outage response | — | ✅ their DevOps |

## What This Requires Us to Build (all V2 — Roadmap Phase 9)

1. Private container registry + per-customer pull access.
2. ~~Migration-on-startup entrypoint in the Docker image~~ — **done**
   (`docker/entrypoint.sh`, pulled forward from V2 since it was tiny and
   also fixes the local `docker compose up` first-run experience).
3. First-run setup wizard replacing the terminal seed script (Step 5).
4. Versioned release process: semantic version tags, release notes,
   backwards-compatible migrations as a hard rule once any customer is
   live.
5. Customer-facing install/upgrade documentation (a hardened, external
   version of this doc).

None of this blocks V1 — V1 is our own internal deployment, where we run
these steps ourselves.
