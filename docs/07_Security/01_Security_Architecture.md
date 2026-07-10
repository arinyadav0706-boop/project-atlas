# Security Architecture — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

---

## 1. Identity & Authentication

- Auth.js (NextAuth) handles OAuth/OIDC flows for Google and Microsoft Entra
  ID, plus an email/password fallback (bcrypt/argon2 hashed, never
  reversible encryption).
- Email-domain restriction is **configuration, not a hardcoded rule** —
  an `ALLOWED_EMAIL_DOMAINS` env var, checked in the Auth.js `signIn`
  callback. It defaults to unset (no restriction) until the organization
  formally signs off on adopting EAGLES, at which point it is set to the
  confirmed company domain in production. See ADR-0005 for the full
  rationale — this lets the founders use and evaluate EAGLES immediately
  without prematurely hardcoding a domain that isn't yet confirmed.
- Sessions use signed, HttpOnly, `SameSite=Lax` cookies (JWT strategy via
  Auth.js). Tokens are never stored in `localStorage`.
- Session lifetime: 12 hours idle timeout, 7-day absolute maximum, forcing
  re-authentication periodically without being disruptive for daily use.

## 2. Authorization (RBAC)

Two levels of role apply:

| Level | Roles (V1 baseline — see Assumption A5 below) | Scope |
|---|---|---|
| Organization | `ADMIN`, `MEMBER` | Org-wide actions: user management, org settings |
| Project | `PROJECT_LEAD`, `MEMBER`, `VIEWER` | Project-scoped actions: issue edits, sprint management |

- Authorization is enforced **only** in the Service Layer, server-side.
  UI-level hiding of buttons is a UX convenience, never a security control.
- Every service method accepts an `actor` context (user id + resolved
  roles) and checks permission before mutating state, per
  `04_Coding_Standards.md §7`.

> **A5 (assumption, to be confirmed):** the exact role names/granularity
> above are a V1 starting proposal. Founders should confirm whether a
> single `MEMBER` project role is sufficient for V1 or whether a
> `CONTRIBUTOR` vs. `VIEWER` split is needed at launch (V2 can always add
> more granular roles since RBAC is table-driven, not hardcoded).

## 3. Transport & Session Security

- HTTPS/TLS enforced everywhere (Vercel provides this by default; Azure
  deployment must terminate TLS at the App Service/Container Apps ingress
  or an Azure Front Door/App Gateway in front of it).
- CSRF protection via Auth.js's built-in CSRF token handling for
  credential-based flows; state-changing Route Handlers only accept
  same-origin requests.
- Security headers set at the Next.js middleware level:
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

## 4. Input Validation & Injection Protection

- All input validated with Zod at the Route Handler boundary before it
  reaches any service (Coding Standards §3).
- SQL injection is structurally prevented by using Prisma's query builder
  exclusively — raw SQL is disallowed unless explicitly reviewed and
  parameterized, with a documented reason.
- XSS is prevented by React's default escaping; `dangerouslySetInnerHTML`
  requires sanitization (e.g., DOMPurify) and a code review note.
- File uploads (attachments) are validated for MIME type and size limit
  server-side (not just client-side), and are stored via the
  `StorageAdapter` interface with generated, non-guessable object keys.

## 5. Audit Logging

- `AuditLog` table records: actor, action, entity type/id, timestamp, and a
  before/after diff for sensitive actions (role changes, project deletion,
  user deactivation, org settings changes).
- Audit log entries are append-only from the application's perspective (no
  update/delete service method is ever exposed for `AuditLog`).

## 6. Data Protection

- Soft delete (`deletedAt`) on all entities — no hard deletes from the
  application layer, preserving audit trail and preventing accidental data
  loss (Coding Standards, Database Design in Phase 2).
- Secrets/config via environment variables only, validated at boot; never
  committed to git (enforced via `.gitignore` + secret-scanning in CI,
  Phase 3).
- Least privilege on the database connection used by the app (a role with
  only the privileges the app needs, not a Postgres superuser), configured
  at deployment time.

## 7. Dependency & Supply Chain

- Dependabot (or equivalent) enabled on the repository for automated
  vulnerability alerts on npm dependencies.
- CI runs `npm audit` (or equivalent) as a non-blocking check initially,
  reviewed regularly; escalate to blocking once the team has bandwidth to
  triage promptly.

## 8. Security Non-Goals for V1 (explicit)

- SOC 2 / ISO 27001 formal compliance — not required for an internal tool
  at this stage; architecture should not preclude it later (audit logging
  and RBAC are steps toward that readiness).
- Penetration testing — recommended before external/SaaS exposure in V2,
  not blocking internal V1 GA.

## 9. Incident Response (baseline)

- Any suspected unauthorized access is investigated using the `AuditLog`
  first; role/session revocation is available to `ADMIN` users
  immediately (force sign-out via session invalidation).
