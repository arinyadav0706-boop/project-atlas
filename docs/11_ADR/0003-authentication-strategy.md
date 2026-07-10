# ADR-0003: Authentication Strategy — Auth.js with SSO-first, Password Fallback

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Founding CTO (this document), pending founder ratification

## Context

EAGLES is an internal enterprise tool for 450–500 employees. Most
enterprises already have an identity provider (Google Workspace or
Microsoft Entra ID). The team has no prior authentication implementation
experience, so the chosen approach must minimize custom security-critical
code.

## Decision

Use Auth.js (NextAuth) as the authentication framework. Configure Google
OAuth and Microsoft Entra ID (OIDC) as the primary sign-in providers.
Provide an email/password credentials provider as a fallback (e.g., for
initial bootstrap before SSO is configured, or for accounts without a
matching IdP), with passwords hashed via bcrypt/argon2. Sessions use
Auth.js's JWT strategy with HttpOnly, `SameSite=Lax` cookies. Organization
and project roles are stored in the application database and attached to
the session via Auth.js callbacks, not sourced from IdP group claims in V1
(IdP group→role mapping is a V2 enhancement).

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Custom-built OAuth/session handling | Security-critical surface area; high risk of subtle vulnerabilities for a team without prior auth experience |
| Auth0 / Okta (managed IDaaS) | Recurring per-user cost works against the < $40/$100 monthly cost targets at 500 users; Auth.js + the org's existing Google/Entra tenants achieves SSO at no extra licensing cost |
| Entra ID group claims driving RBAC directly (V1) | Adds coupling to IdP configuration/claims mapping before the team has validated the RBAC model itself; deferred to V2 once the role model (Security §2) is confirmed in production use |

## Consequences

- Positive: no per-user IDaaS licensing cost; employees use existing
  corporate credentials; Auth.js handles CSRF/session security correctly by
  default.
- Negative / trade-offs accepted: the team must correctly configure OAuth
  redirect URIs and secrets per environment (local/dev/prod) — documented
  in `docs/06_Infrastructure/` and `.env.example` in Phase 3.
- Follow-up actions required: founders to confirm which IdP(s) are actually
  available in the organization (Google Workspace, Entra ID, or both)
  before Phase 3 configures provider credentials.
