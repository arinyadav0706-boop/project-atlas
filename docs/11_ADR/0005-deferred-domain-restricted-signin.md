# ADR-0005: Configurable, Deferred Domain-Restricted Sign-In

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founding CTO (this document), pending founder ratification
**Extends:** ADR-0003 (Authentication Strategy) — does not change that
decision, only the launch configuration of the domain-restriction control.

## Context

The founders' company (working domain assumed: `consint.ai`) has not yet
formally decided whether to adopt EAGLES org-wide. Until that sign-off
happens, the founders need to sign in themselves, explore the running
product, and brainstorm functionality — i.e., authentication must work
*now*, before there is an official rollout decision. At the same time, the
long-term enterprise requirement (once adopted) is that only company
accounts (`@consint.ai`) may ever sign in — this cannot be an afterthought
bolted on after go-live.

## Decision

Implement email-domain restriction as **configuration, not a hardcoded
rule**, enforced in the Auth.js `signIn` callback via an
`ALLOWED_EMAIL_DOMAINS` environment variable (comma-separated list, e.g.
`consint.ai`).

- **Pre-signoff (current default):** `ALLOWED_EMAIL_DOMAINS` is unset →
  no application-level domain restriction. Sign-in still requires a
  successful Google or Microsoft Entra ID OAuth/OIDC login (or the
  email/password fallback), so this is not "open to the internet" — it's
  open to anyone who can authenticate against the configured identity
  provider(s), which in practice is the founders and any invited testers.
- **Post-signoff:** once the company formally commits to adopting EAGLES,
  ops sets `ALLOWED_EMAIL_DOMAINS=consint.ai` (or the confirmed real domain)
  in the production environment. From that point, any authenticated
  identity whose email domain isn't in the list is rejected at the
  `signIn` callback and logged to `AuditLog` as a denied sign-in attempt.
- If/when the app registration is created inside the company's actual
  Microsoft Entra tenant as a single-tenant app (per ADR-0003), that
  provides a second, independent layer of restriction (only accounts
  inside that Entra directory can reach the consent screen at all) —
  the env-var check is defense-in-depth on top of that, and is the only
  restriction layer for the Google provider (via Google's `hd` hosted-domain
  parameter, same allow-list).
- No code path may assume a specific domain literal — the allow-list is
  always read from configuration, never hardcoded to `consint.ai`, since the
  actual domain is not yet confirmed by sign-off.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Hardcode `@consint.ai` restriction now | Blocks the founders' own pre-signoff evaluation use; also risky to hardcode a domain that isn't yet confirmed as final |
| No domain-restriction capability at all until explicitly requested later | Enterprise requirement is already known; building the capability now (just defaulted off) costs almost nothing and avoids a rushed retrofit at go-live |
| Restrict via a separate feature flag service | Overkill — a single validated env var is sufficient and consistent with how all other provider config is handled (Coding Standards, Tech Stack §9) |

## Consequences

- Positive: founders can use EAGLES immediately for evaluation and
  brainstorming without waiting on an organizational decision; turning on
  the enterprise-grade restriction later is a one-line config change in
  production, not a code change or redeploy of new logic.
- Negative / trade-offs accepted: during the pre-signoff period, anyone who
  can authenticate against the configured Google/Entra tenant or the
  password fallback can sign in — acceptable because this period is
  explicitly an internal evaluation phase, not production rollout.
- Follow-up actions required:
  - Phase 3: implement the Zod-validated env schema entry for
    `ALLOWED_EMAIL_DOMAINS` (optional, defaults to empty/no restriction)
    and the `signIn` callback check.
  - At sign-off time: set `ALLOWED_EMAIL_DOMAINS` in the production
    environment and confirm the Entra app registration is bound to the
    company's real tenant — tracked as a Phase 7 (Hardening) / Phase 8
    (Internal GA) checklist item in `docs/10_Roadmap/01_Development_Roadmap.md`.

## Amendment — 2026-07-29 (security finding F6): provisioning fails closed

The original "pre-signoff" default (unset `ALLOWED_EMAIL_DOMAINS` → any
successfully-authenticated identity may sign in) also silently **auto-created**
a new org member for any Google/Microsoft account on first login. The security
assessment (F6) flagged this: if SSO is enabled in production without the
allowlist set, *anyone on the internet with a Google account* self-registers
into the org.

**Change:** auto-provisioning is now gated on the allowlist and **fails closed**
(`canAutoProvisionSsoUser`, `src/features/authentication/services/provisioning.ts`):

- **No allowlist configured → SSO is invite-only.** Existing users (created via
  the admin invite flow, or before a restriction) can still sign in; an *unknown*
  SSO identity is **rejected**, not created (logged `SIGNIN_REJECTED_NO_PROVISIONING`).
- **Allowlist configured → auto-provision only emails whose domain is on it.**
  The existing domain-restriction check (which rejects non-allowed domains for
  *all* sign-ins) is unchanged.

This makes a forgotten/missing config safe by default (no open registration)
while preserving the "one-line config to open a trusted domain" ergonomics.
