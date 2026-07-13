# ADR-0001: Feature-First Modular Monolith (not microservices, not layer-first)

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founding CTO (this document), pending founder ratification

## Context

The team is two founders with ~6 months of software experience. The product
must support 500 users / 60 concurrent today and remain extensible to a
multi-tenant SaaS product later, without a rewrite. We need an architecture
that is simple enough to be fully understood and operated by this team,
while not painting us into a corner on maintainability or scale.

## Decision

Build a single Next.js application (one deploy unit) organized internally
by **feature** (`features/projects`, `features/issues`, etc.), each feature
layered internally as UI → hooks → API handler → service → repository. No
separate microservices. No layer-first (`controllers/`, `models/`) top-level
organization. Tenant-scoping (`organizationId`) is present in the schema
from day one even though V1 has exactly one tenant.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Microservices per module | Operational complexity (multiple deploys, service discovery, distributed tracing) far exceeds team capacity at this stage and this scale (60 concurrent users) |
| Layer-first monolith (`controllers/`, `services/`, `models/` at repo root) | Becomes unnavigable as modules grow; couples unrelated features through shared top-level folders; harder to eventually extract a feature into its own service |
| Separate SPA + standalone API server | Two deploy units, two configs, duplicated types between client/server — unnecessary overhead for a small team when Next.js Route Handlers give us one deploy unit with shared types |
| Multi-tenant schema deferred to V2 | Retrofitting `organizationId` onto every table later is a risky, big-bang migration across live data; adding it now costs almost nothing |

## Consequences

- Positive: one deploy pipeline to learn and operate; clear ownership
  boundaries per feature; a feature can be extracted into its own service
  later because the service-layer seam already exists; SaaS conversion in
  V2 is additive, not a rewrite.
- Negative / trade-offs accepted: all features currently scale together
  (one Next.js process) — if one feature (e.g., search) needs independent
  scaling before V2, it will need to be extracted at that time.
- Follow-up actions required: enforce the cross-feature import rule (no
  direct repository imports across features) via ESLint boundaries rule in
  Phase 3.
