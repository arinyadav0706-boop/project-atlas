# Module: Authentication

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

Every EAGLES screen requires an authenticated session. Sign-in is handled
by Auth.js configured with Google OAuth, Microsoft Entra ID (OIDC), and an
email/password fallback (ADR-0003). Session strategy is JWT (HttpOnly,
`SameSite=Lax` cookie). Email-domain restriction is deferred, configurable
policy — see ADR-0005 — not enforced at launch.

## Business Rules

- BR-1: A user record is matched by email on sign-in. A **new** record is
  auto-created only for an SSO identity whose email domain is on
  `ALLOWED_EMAIL_DOMAINS` (security finding F6, ADR-0005 amendment). With no
  allowlist configured, SSO is **invite-only** — an unknown SSO identity is
  rejected (`SIGNIN_REJECTED_NO_PROVISIONING`), never silently added — so a
  missing config fails closed instead of opening public self-registration. The
  `Organization` link is fixed (V1 has one org).
- BR-2: New users default to `orgRole = MEMBER`. The first `ADMIN` is
  created via a one-time seed/bootstrap script (Phase 3), not through the
  UI (there is no UI path to create the first admin from nothing).
- BR-3: If `ALLOWED_EMAIL_DOMAINS` is set (ADR-0005), any authenticated
  identity whose email domain isn't in the list is rejected in the
  `signIn` callback and logged to `AuditLog` (`action: SIGNIN_REJECTED_DOMAIN`).
- BR-4: A deactivated user (`isActive = false`) is rejected at the
  `signIn` callback regardless of a valid IdP session, and any existing
  session is invalidated on next request (session check re-validates
  `isActive` server-side, not just at login).
- BR-5: The email/password fallback requires a password meeting the
  Validation rules below; passwords are hashed with bcrypt/argon2, never
  stored or logged in plain text.
- BR-6: Successful and rejected sign-in attempts are not spammed to
  `AuditLog` for normal successful logins (would flood the audit trail) —
  only `lastLoginAt` is updated; rejections (BR-3, BR-4) are logged since
  they're security-relevant.

## Database

`User`, `AuthAccount`, `Organization` — see `docs/03_Database/01_Database_Design.md §2.1-2.3`.
No new tables.

## API

Sign-in/sign-out/callback endpoints are handled entirely by Auth.js's
internal `/api/auth/[...nextauth]` catch-all route and are intentionally
not enumerated in `docs/04_API/openapi.yaml` (see that file's `info.description`).
Every other endpoint in the spec requires the session cookie
(`components.securitySchemes.sessionCookie`).

## UI

Screen #1 (Sign in) in `docs/05_UI/02_Screens_and_Information_Architecture.md`:
a single centered card (light theme, per Design Principles) with
"Continue with Google" and "Continue with Microsoft" buttons as the
primary actions, and a collapsed/secondary email+password form below a
divider — SSO is the intended default path, not a coin-flip choice.
Error states: domain-not-allowed, account-deactivated, invalid
credentials — each a distinct, human-readable message, never a raw
provider error.

## Acceptance Criteria

- Given a user with a valid Google/Entra ID session in the allowed
  tenant, when they click "Continue with Google/Microsoft," then they land
  on `/dashboard` authenticated, and their `User` row is created if it
  didn't exist.
- Given `ALLOWED_EMAIL_DOMAINS` is unset (pre-signoff default), when any
  user authenticates via a configured provider, then sign-in succeeds
  regardless of email domain.
- Given `ALLOWED_EMAIL_DOMAINS=consint.ai` (post-signoff), when a user
  authenticates with a non-`consint.ai` email, then sign-in is rejected with
  a clear message and the attempt is logged to `AuditLog`.
- Given a deactivated user, when they attempt to sign in (or have an
  existing session), then access is denied and they're redirected to
  sign-in with an "account deactivated, contact your admin" message.
- Given the email/password fallback, when a user submits a password not
  meeting the Validation rules, then the form shows inline validation
  errors before any request is sent.

## Validation

- Credentials sign-in: `email` (valid email format), `password` (min 8
  chars — full complexity policy owned by this doc, not invented ad hoc
  elsewhere).
- Env schema (`shared/lib/env.ts`, Phase 3): `ALLOWED_EMAIL_DOMAINS`
  (optional, comma-separated), `GOOGLE_CLIENT_ID/SECRET`,
  `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, `NEXTAUTH_SECRET` — all
  Zod-validated at process startup, failing fast if malformed/missing in a
  configuration that requires them.

## Future Scope

- Mapping Entra ID group claims directly to `orgRole`/`ProjectRole` (ADR-0003).
- Multi-factor policy beyond what the IdP itself enforces.
- Magic-link / passwordless email sign-in.
- Self-service password reset flow for the credentials fallback (V1:
  admin-assisted reset only, since it's a fallback path, not the primary
  flow).
