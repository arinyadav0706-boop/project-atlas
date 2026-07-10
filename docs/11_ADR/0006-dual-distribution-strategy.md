# ADR-0006: Dual Distribution Strategy — SaaS + Self-Hosted

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founders

## Context

EAGLES was originally scoped purely as an internal tool. The founders have
now confirmed the intent to eventually offer EAGLES to other companies via
both a hosted (SaaS) product and a self-hosted/licensed deployment for
customers who need to run it on their own infrastructure. This has
implications for multi-tenancy priority, IP protection, and how the
application is packaged/distributed — worth recording formally since it's
a business-model decision that shapes technical priorities going forward,
not just an internal preference.

## Decision

Support both distribution models long-term:

1. **SaaS** — we host EAGLES; customers get a URL and a login, their data
   isolated by `organizationId` in a shared database (builds on the
   multi-tenancy groundwork already laid in ADR-0001).
2. **Self-hosted** — customers run EAGLES on their own infrastructure via
   a **private container image**, never via access to this source
   repository. The image is built from `docker/Dockerfile` (already
   proven in Phase 3) and distributed through a private container
   registry with per-customer access control.

This repository (source + docs + ADRs) remains **private** indefinitely
under this decision — distribution never means handing over source code,
only a compiled, sealed artifact (the Docker image) for the self-hosted
path, or nothing at all beyond a login for the SaaS path.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| SaaS-only | Excludes enterprise customers whose IT/security policy requires data to stay on infrastructure they control — a real segment for internal-tool-replacement products like this |
| Self-hosted-only | No low-friction, low-effort adoption path; harder to acquire early customers than "sign up and go" |
| Open-sourcing the codebase | Gives up competitive differentiation with no clear benefit at this stage; can be revisited later as its own explicit decision, not bundled into this one |

## Consequences

- Positive: no rework needed on the core data model or portability
  decisions already made (ADR-0001, ADR-0003, ADR-0004) — they were made
  with exactly this kind of flexibility in mind and turn out to already
  cover most of what both models need (see
  `docs/00_Product/04_Business_Model_and_Distribution_Strategy.md §2`).
- Negative / trade-offs accepted: full multi-tenant SaaS conversion
  (tenant resolution, per-request org scoping, self-serve signup,
  billing) and self-hosted packaging (private registry, license/access
  control, a real setup wizard instead of a terminal seed script) are
  both real, currently-unbuilt scope — sequenced as V2/V2+ per the
  roadmap, not pulled into V1.
- Follow-up actions required:
  - Confirm this GitHub repository's visibility is set to Private.
  - Decide license enforcement approach for self-hosted (recommendation:
    trust-based, gated by registry access — see Business Model doc §5).
  - Draft a real software license/terms of service before the first
    external paying customer of either kind.
