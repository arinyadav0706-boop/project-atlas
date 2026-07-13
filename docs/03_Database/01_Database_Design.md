# Database Design — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

This is the canonical schema. `prisma/schema.prisma` (Phase 3) must match
this document exactly — the document is authored first; the ORM schema is
generated from it, not the reverse. Per `CLAUDE.md`, no code may introduce a
table, field, or relation that isn't listed here.

Related: `02_ER_Diagram.md`, `docs/04_API/openapi.yaml`, every
`docs/02_Modules/*.md`.

---

## 1. Conventions (apply to every table unless noted as an explicit exception)

| Convention | Rule |
|---|---|
| Primary key | `id String @id @default(cuid())` — collision-resistant, sortable-enough, no DB extension required (portable across Supabase/Azure Postgres) |
| Audit fields | `createdAt DateTime`, `updatedAt DateTime`, `createdBy String? → User.id`, `updatedBy String? → User.id`, `deletedAt DateTime?` (soft delete) |
| Soft delete | No hard deletes from application code. All "active" queries filter `deletedAt IS NULL` at the repository layer. |
| Tenancy | Every tenant-scoped table carries `organizationId String → Organization.id` (V1 has exactly one `Organization` row — see ADR-0001, Vision §8 A1) |
| Enums | Modeled as Prisma/Postgres enums, not free-text strings — see §3 |
| Explicit exception | `AuditLog` (§2.13) is itself an audit trail: it has `createdAt` + `actorId` but no `updatedAt`/`updatedBy`/`deletedAt` — it is immutable by design (Security Architecture §5) |

## 2. Entities

### 2.1 Organization
Multi-tenancy anchor (Vision §8 A1). V1 has exactly one row.

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| name | String | |
| domain | String | e.g. `consit.ai` — used by ADR-0005's `ALLOWED_EMAIL_DOMAINS` config, not enforced at the DB level |
| + audit fields | | `createdBy`/`updatedBy` nullable (bootstrap row has no creator) |

### 2.2 User
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| organizationId | String (FK → Organization) | |
| email | String (unique) | |
| name | String | |
| avatarUrl | String? | |
| passwordHash | String? | null if the user only ever signs in via SSO |
| orgRole | Enum `OrgRole` | `ADMIN` \| `MEMBER` — see §3.1 |
| isActive | Boolean | default `true`; deactivation is `isActive=false`, distinct from soft delete (BR-2 in BRD: users are never hard-deleted, and deactivation must not destroy issue attribution) |
| lastLoginAt | DateTime? | |
| notificationsEnabled | Boolean | default `true`; single global in-app notification toggle for V1 — granular per-notification-type preferences are V2 scope (`docs/02_Modules/16_profile.md` Future Scope) |
| + audit fields | | |

### 2.3 AuthAccount
Links a `User` to the identity provider(s) they've authenticated with.
Deliberately minimal — V1 does not call Google/Graph APIs on the user's
behalf, so no OAuth tokens are persisted, only enough to identify the link.

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| userId | String (FK → User) | |
| provider | Enum `AuthProvider` | `GOOGLE` \| `MICROSOFT_ENTRA` \| `CREDENTIALS` |
| providerAccountId | String | subject/object-id claim from the provider, or n/a for `CREDENTIALS` |
| createdAt | DateTime | (no update/delete — a linked account is removed by deleting the row, not soft-deleting) |

Unique constraint: `(provider, providerAccountId)`.

### 2.4 Project
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| organizationId | String (FK → Organization) | |
| key | String | short uppercase code, e.g. `ENG` (Business Rules §4.1 in `04_issues.md`); unique per organization |
| name | String | |
| description | String? | |
| status | Enum `ProjectStatus` | `ACTIVE` \| `ARCHIVED` |
| issueKeyCounter | Int | default `0`; incremented transactionally on each new Issue to generate `key-N` (e.g. `ENG-42`) — see Issue §2.7 |
| + audit fields | | |

### 2.5 ProjectMember
Join table: a user's role **within a specific project**.

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| projectId | String (FK → Project) | |
| userId | String (FK → User) | |
| role | Enum `ProjectRole` | `LEAD` \| `MEMBER` \| `VIEWER` — see §3.2 |
| + audit fields | | |

Unique constraint: `(projectId, userId)`. BR: a project must always have at
least one `LEAD` (enforced in the service layer, not the DB — see
`docs/02_Modules/03_projects.md`).

### 2.6 Sprint
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| projectId | String (FK → Project) | |
| name | String | |
| goal | String? | |
| status | Enum `SprintStatus` | `PLANNED` \| `ACTIVE` \| `COMPLETED` |
| startDate | DateTime? | required to transition to `ACTIVE` |
| endDate | DateTime? | required to transition to `ACTIVE` |
| + audit fields | | |

BR: only one `ACTIVE` sprint per project at a time (PRD FR-4.1) — enforced
in the service layer via a transactional check.

### 2.7 Issue
The core entity.

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| projectId | String (FK → Project) | |
| key | String | `<Project.key>-<n>`, generated from `Project.issueKeyCounter`, immutable once set |
| type | Enum `IssueType` | `EPIC` \| `STORY` \| `TASK` \| `BUG` |
| title | String | |
| description | String? | rich text stored as sanitized HTML or Markdown — decided in `docs/02_Modules/04_issues.md` |
| status | Enum `IssueStatus` | `TODO` \| `IN_PROGRESS` \| `IN_REVIEW` \| `DONE` — the one fixed V1 workflow (PRD FR-3.2, non-goal: configurable workflows) |
| priority | Enum `IssuePriority` | `LOWEST` \| `LOW` \| `MEDIUM` \| `HIGH` \| `HIGHEST` |
| assigneeId | String? (FK → User) | nullable — unassigned is valid |
| reporterId | String (FK → User) | who filed it; distinct from `createdBy` conceptually but same value in V1 (no "filed on behalf of") |
| sprintId | String? (FK → Sprint) | null = in the backlog, not yet scheduled |
| epicId | String? (FK → Issue, self-relation) | only meaningful when `type != EPIC` |
| storyPoints | Int? | |
| boardOrder | Float | fractional-indexing position within its status column / backlog list (see `docs/02_Modules/05_board.md` for the rebalancing rule) |
| dueDate | DateTime? | |
| + audit fields | | |

### 2.8 Label
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| organizationId | String (FK → Organization) | labels are org-wide, not per-project, to keep V1 simple |
| name | String | unique per organization |
| color | String | hex code |
| + audit fields | | |

### 2.9 IssueLabel
Join table, `(issueId, labelId)` unique. No audit fields beyond
`createdAt`/`createdBy` — it's a pure association with no independent
lifecycle to update.

### 2.10 Comment
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| issueId | String (FK → Issue) | |
| authorId | String (FK → User) | |
| parentCommentId | String? (FK → Comment, self-relation) | supports one level of threading (a reply); a reply's own `parentCommentId` must point to a top-level comment, not another reply — no deeply nested chains in V1 (`docs/02_Modules/08_comments.md`) |
| body | String | sanitized rich text/Markdown; `@mentions` parsed at write-time to trigger notifications (no separate `Mention` table in V1 — see `docs/02_Modules/08_comments.md`) |
| + audit fields | | |

### 2.11 Attachment
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| issueId | String (FK → Issue) | |
| uploadedById | String (FK → User) | |
| fileName | String | original file name, shown in UI |
| storageKey | String | opaque key passed to `StorageAdapter`; never a raw public URL stored (signed URLs generated on read) |
| mimeType | String | validated server-side against an allow-list (Security Architecture §4) |
| sizeBytes | Int | validated server-side against a max size (Coding Standards / module doc) |
| + audit fields | | |

### 2.12 Notification
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| userId | String (FK → User) | recipient |
| type | Enum `NotificationType` | `ASSIGNED` \| `MENTIONED` \| `STATUS_CHANGED` \| `COMMENT_ADDED` |
| entityType | Enum `NotificationEntityType` | `ISSUE` \| `COMMENT` \| `SPRINT` |
| entityId | String | id of the referenced entity (not a typed FK — polymorphic by design) |
| message | String | precomputed display text (avoids re-joining source data just to render the notification list) |
| isRead | Boolean | default `false` |
| readAt | DateTime? | |
| createdBy | String? (FK → User) | the actor whose action triggered this notification (may be null for system-generated notifications) |
| createdAt | DateTime | (no `updatedBy`/`deletedAt` — a notification's only mutation is `isRead`, handled via `updatedAt`) |
| updatedAt | DateTime | |

### 2.13 AuditLog
**Explicit exception to the standard audit-field convention** (§1) — this
table **is** the audit trail; append-only, per Security Architecture §5.

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | |
| organizationId | String (FK → Organization) | |
| actorId | String? (FK → User) | null for system actions |
| action | String | e.g. `PROJECT_DELETED`, `ROLE_CHANGED`, `USER_DEACTIVATED` |
| entityType | String | |
| entityId | String | |
| beforeData | Json? | |
| afterData | Json? | |
| createdAt | DateTime | |

**Dual purpose:** in addition to the security/compliance events in
Security Architecture §5, `Issue` status transitions are also written here
(`action: ISSUE_STATUS_CHANGED`, `beforeData: {status}`, `afterData:
{status}`) specifically so `docs/02_Modules/11_reports.md`'s cycle-time
report can compute time-in-status without a separate history table.

No `update`/`delete` service method is ever exposed for this table
(Security Architecture §5).

## 3. Enums Reference

### 3.1 `OrgRole`
`ADMIN` — full org administration (users, roles, org settings).
`MEMBER` — standard employee.

### 3.2 `ProjectRole`
`LEAD` — manages project settings, sprints, membership.
`MEMBER` — creates/edits issues, participates in sprints/board.
`VIEWER` — read-only.

> These two enums are the A5 assumption flagged in `docs/07_Security/01_Security_Architecture.md §2` — confirmed as the V1 baseline by proceeding into Phase 2; still revisit if founder feedback differs before Phase 3 generates the Prisma schema.

## 4. Relationships Overview

- `Organization` 1—* `User`, `Project`, `Label`, `AuditLog`
- `Project` 1—* `ProjectMember`, `Sprint`, `Issue`
- `User` 1—* `ProjectMember`, `Issue` (as assignee/reporter), `Comment`, `Attachment`, `Notification`
- `Sprint` 1—* `Issue` (optional — null while in backlog)
- `Issue` 1—* `Comment`, `Attachment`, `IssueLabel`; self-relation to `Epic` (an `Issue` of type `EPIC`)
- `Comment` 1—* `Comment` (self-relation via `parentCommentId`, one level of replies only)
- `Label` *—* `Issue` via `IssueLabel`

Full visual: `02_ER_Diagram.md`.

## 5. Indexing Strategy

| Table | Index | Reason |
|---|---|---|
| `User` | unique `email` | login lookup |
| `Project` | unique `(organizationId, key)` | key uniqueness + org-scoped listing |
| `ProjectMember` | unique `(projectId, userId)`; index `userId` | membership checks, "my projects" queries |
| `Issue` | unique `(projectId, key)`; index `(projectId, status)`; index `(sprintId)`; index `(assigneeId)` | board/backlog queries, "my issues" dashboard queries |
| `Comment` | index `issueId` | issue detail view |
| `Notification` | index `(userId, isRead)` | notification bell query |
| `AuditLog` | index `(organizationId, createdAt)` | audit review, newest-first |
| Full-text search | `GIN` index on `to_tsvector` over `Issue.title`/`Issue.description` and `Project.name` | PRD FR-6.1, `docs/02_Modules/12_search.md` |

## 6. Formerly Open Items — Now Decided

- `ProjectRole`/`OrgRole` granularity (§3): **confirmed as-is**, with the
  explicit founder decision (2026-07-12) that org `ADMIN` carries **no**
  implicit project-level powers — see `docs/02_Modules/15_roles.md`.
- `description`/`Comment.body` storage format: **founder-confirmed
  (2026-07-12): Markdown source**, sanitized at render. (For reference:
  Jira Cloud uses its proprietary ADF JSON format, Asana a restricted
  HTML subset — both serve collaborative-editing needs V1 doesn't have;
  Markdown remains convertible to a richer format later if V2+ needs it.)
- Attachment max size / MIME allow-list: defaults in
  `docs/02_Modules/09_attachments.md` (25 MB, allow-list per BR-3) stand
  unless founders object before the Attachments module is built (Phase 5).
