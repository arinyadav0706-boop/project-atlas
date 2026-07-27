# ADR-0027 — Profile: Self-Service Account Settings on the Existing User Row

- Status: Accepted
- Date: 2026-07-27
- Deciders: Founding team
- Relates to: `docs/02_Modules/16_profile.md`, `docs/02_Modules/14_user_management.md`

## Context

Every module that shows a person (assignee, reporter, comment author, component
lead) already reads name/avatar from the `User` row, and the top-bar account
menu already links to `/profile` — but that route never existed, so the link was
dead. We need a **self-service** surface where a person edits only *themselves*,
cleanly separated from **User Management** (an ADMIN editing *others'* org role
and status, capability-gated). The `User` table already carries every field this
needs — `name`, `avatarUrl`, `notificationsEnabled`, plus read-only `email`,
`orgRole`, `isActive`, and `projectMemberships`. Avatars must not become a
Supabase/S3-only dependency in feature code (ADR-0004), and must not leak across
tenants (F-1). The open question is how to store/serve an uploaded avatar
without inventing schema, and how to keep the top bar fresh after an edit
(session identity lives in the JWT, not the DB).

## Decision

Build Profile as a thin feature over the caller's **own** `User` row via
`/users/me` — **no new tables or fields** — storing avatars through the
`StorageAdapter` under an opaque per-user key and serving them through an
**org-scoped proxy route**, with the client refreshing its session token on save
so the top bar updates without a re-login.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Fold self-edit into the User Management module/endpoints | Conflates two RBAC models — self-service vs. capability-gated admin; risks an admin field leaking into a self-edit path. Keeping them separate makes AC-3 (no privilege self-grant) structural, not a filter. |
| Add an `avatarStorageKey` (or an `Avatar` table) column | Violates "never invent DB fields" (rule 2) for zero benefit — a deterministic per-user key + the existing `avatarUrl` string are sufficient; the URL carries a cache-busting token. |
| Let the client set `avatarUrl` to any string | Unvalidated SSRF/abuse surface and breaks portability; avatars go through the same `StorageAdapter` seam as attachments (ADR-0017). |
| Public/unguarded avatar URLs (or signed CDN URLs) | Public leaks avatars across tenants (F-1); signed URLs are a documented Future seam (ADR-0017), unnecessary at 500-user scale. An RBAC-lite org-scoped proxy is enough now. |
| Per-notification-type preference matrix | Premature abstraction (rule 10); the single `notificationsEnabled` boolean already gates fan-out (`10_notifications.md` BR-2). Deferred to Future Scope. |
| Audit every self-edit of name/avatar | High-volume, low-value noise in the admin audit log, which exists for administrative acts (`13_admin.md`). Self-edits are single-owner and self-evident. |

## Consequences

- **Positive:**
  - Zero schema change; the feature is a small, modular slice
    (`features/profile/{types,validation,repositories,services,components}`)
    following the established pattern.
  - Self-service and admin authority are separated by construction: the update
    schema is `.strict()` and simply has no `orgRole`/`isActive` keys, so a
    crafted request can't grant privilege (AC-3).
  - Avatars stay portable (StorageAdapter) and tenant-safe (org-scoped proxy,
    F-1), reusing the exact seam attachments already proved.
  - Edits propagate everywhere for free — one `User` row, no denormalized copies
    (AC-1) — and the top bar refreshes via `useSession().update()`.
- **Negative / trade-offs accepted:**
  - The avatar proxy re-reads bytes per request (no CDN/signed URL yet); fine at
    this scale, and the ADR-0017 signed-URL seam is the documented upgrade path.
  - Avatar content-type is sniffed from magic bytes on serve rather than stored,
    to avoid a schema field; the upload allow-list keeps this bounded.
  - The `jwt` callback gains an `update`-trigger branch that re-reads name/avatar
    from the DB — a small, well-scoped touch to auth config.
- **Follow-up actions required:**
  - None blocking. Future Scope (per-type notifications, timezone/locale, email
    change, avatar cropping) tracked in `16_profile.md` and the backlog.
