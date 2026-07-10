# Business Model & Distribution Strategy — EAGLES

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

Records a founder decision: EAGLES is intended to eventually be offered to
other companies via **both** a hosted (SaaS) model and a self-hosted
(on-premise/licensed) model, not just built for internal use. See
ADR-0006 for the formal architecture decision this implies.

---

## 1. The Two Distribution Models

| | **SaaS (hosted)** | **Self-hosted (on-premise/licensed)** |
|---|---|---|
| Who runs the servers | Us | The customer, on their own cloud/infra |
| Where their data lives | Our database (isolated per customer) | Their own database, never touches our servers |
| What the customer receives | A URL + login, nothing else | A private Docker image + setup instructions |
| Do they get our source code? | No | **No — a Docker image is a sealed, runnable package, not source code.** See §3. |
| Revenue model | Recurring subscription (per-seat/per-month) | License fee (one-time and/or annual) |
| Analogous products | Jira Cloud, Notion, Slack | GitLab Self-Managed, Mattermost, Sentry self-hosted |

Many enterprise tools (GitLab, Sentry, Mattermost) offer **both**
simultaneously — SaaS for easy/low-friction adoption, self-hosted for
customers whose IT/security policy requires data to stay on their own
infrastructure (common for larger enterprises, regulated industries,
government). That's the model being adopted here.

## 2. What's Already Architecturally Ready (and why)

Good news: earlier architecture decisions, made for portability reasons
independent of this business decision, already cover most of what both
models need:

| Requirement | Status | Where it comes from |
|---|---|---|
| Data isolated per customer (multi-tenancy) | Schema-ready | `Organization` entity + `organizationId` on every tenant-scoped table (ADR-0001, Vision §8 A1) |
| Runs on infrastructure we don't control | Proven | Docker + Docker Compose (ADR-0004), validated in Phase 3 |
| Customer can bring their own login system | Ready | Auth.js provider config is entirely environment-variable driven — a self-hosted customer points it at *their own* Google Workspace/Entra tenant, not ours (ADR-0003) |
| Customer can bring their own file storage | Ready | `StorageAdapter` interface (ADR-0004) — self-hosted customers can point it at their own storage instead of our Supabase/Azure Blob |

## 3. Source Code Never Leaves This Repo

This is the critical clarification behind the founders' question: **"self-hosted" does not mean handing over source code.**

- This GitHub repository (code + docs + ADRs) stays **private**, visible
  only to the founding team (and Cursor/Claude acting on their behalf).
  **Action item**: confirm the repo's visibility is set to Private in
  GitHub settings — this doc assumes it, but it should be explicitly
  checked, not assumed.
- What a self-hosted customer receives is a **container image** — a
  pre-built, compiled artifact (from `docker/Dockerfile`) pushed to a
  **private container registry** (e.g., GitHub Container Registry or
  Azure Container Registry, access-controlled per customer). They run
  `docker compose up` (or deploy the image to their own Azure/AWS), but
  cannot read, extract, or modify the source code from the image.
- If EAGLES is ever open-sourced, that would be a **separate, explicit,
  much bigger decision** — not an accidental side effect of offering
  self-hosted deployments.

## 4. What's Still Needed (not built yet — sequencing, not urgency)

| Gap | Needed for | Notes |
|---|---|---|
| Multiple `Organization` rows actually usable end-to-end (tenant resolution, every query scoped, self-serve signup) | SaaS | Currently V1 assumes exactly one `Organization` row (Vision §8 A1); full multi-tenant conversion is already listed as V2 scope in the Roadmap — this decision confirms that priority rather than changing it |
| Billing/subscription management | SaaS | V2, not started |
| Private container registry + per-customer access control | Self-hosted | Not set up yet — needed only once the first self-hosted customer is real |
| License enforcement mechanism (or lack thereof) | Self-hosted | **Open decision** — see §5 |
| Self-hosted "first run" setup wizard (create org, first admin, connect DB) | Self-hosted | `prisma/seed.ts` (Phase 3) is a primitive, terminal-only version of this; a real customer needs a guided UI setup instead of a script |
| Update/upgrade path for self-hosted customers (new image versions, running new migrations themselves) | Self-hosted | Not designed yet |

## 5. Open Decisions Requiring Founder Input

- **License enforcement**: should self-hosted deployments require a
  license key (more engineering work, prevents unauthorized copies) or
  ship on trust (simpler — if someone has the private image, they can run
  it; access control happens entirely at the "who gets registry pull
  access" layer instead)? Recommendation for now: **trust-based**,
  gated by private registry access — simplest, revisit only if it becomes
  a real problem.
- **Pricing/packaging** for either model — a business decision, not a
  technical one; not blocking any current engineering work.
- **Legal**: a real license agreement/terms of service is needed before
  the first external paying customer of either kind — currently no
  `LICENSE` file or customer-facing terms exist in this repo. Flagged
  here so it isn't forgotten, not urgent while EAGLES is pre-revenue.

## 6. What This Changes About Priorities (nothing, yet)

No V1 module scope changes because of this decision — V1 is still the
internal-use MVP per `01_Product_Vision.md`. This confirms that the
multi-tenant SaaS conversion and self-hosted packaging work already
flagged as V2/V2+ in `docs/10_Roadmap/01_Development_Roadmap.md` are real
priorities to build toward, not speculative — but they remain sequenced
after V1 ships internally, per the existing roadmap gates.
