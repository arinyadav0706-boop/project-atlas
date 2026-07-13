# Entity-Relationship Diagram — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

Companion to `01_Database_Design.md` — field-level detail lives there; this
is the visual relationship map. Audit fields (`createdAt`, `updatedAt`,
`createdBy`, `updatedBy`, `deletedAt`) are omitted below for readability —
assume every entity has them except `AuditLog` and `IssueLabel`/`AuthAccount`
(see `01_Database_Design.md §1`).

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "employs"
    ORGANIZATION ||--o{ PROJECT : "owns"
    ORGANIZATION ||--o{ LABEL : "defines"
    ORGANIZATION ||--o{ AUDIT_LOG : "records"

    USER ||--o{ AUTH_ACCOUNT : "authenticates via"
    USER ||--o{ PROJECT_MEMBER : "is member of"
    USER ||--o{ ISSUE : "assigned to / reported"
    USER ||--o{ COMMENT : "authors"
    USER ||--o{ ATTACHMENT : "uploads"
    USER ||--o{ NOTIFICATION : "receives"

    PROJECT ||--o{ PROJECT_MEMBER : "has"
    PROJECT ||--o{ SPRINT : "has"
    PROJECT ||--o{ ISSUE : "contains"

    SPRINT ||--o{ ISSUE : "scopes (optional)"

    ISSUE ||--o{ COMMENT : "has"
    ISSUE ||--o{ ATTACHMENT : "has"
    ISSUE ||--o{ ISSUE_LABEL : "tagged with"
    ISSUE ||--o{ ISSUE : "epic parent of"
    COMMENT ||--o{ COMMENT : "replies to (one level)"
    LABEL ||--o{ ISSUE_LABEL : "applied to"

    ORGANIZATION {
        string id PK
        string name
        string domain
    }
    USER {
        string id PK
        string organizationId FK
        string email UK
        string name
        string orgRole
        boolean isActive
        boolean notificationsEnabled
    }
    AUTH_ACCOUNT {
        string id PK
        string userId FK
        string provider
        string providerAccountId
    }
    PROJECT {
        string id PK
        string organizationId FK
        string key UK
        string name
        string status
        int issueKeyCounter
    }
    PROJECT_MEMBER {
        string id PK
        string projectId FK
        string userId FK
        string role
    }
    SPRINT {
        string id PK
        string projectId FK
        string name
        string status
        datetime startDate
        datetime endDate
    }
    ISSUE {
        string id PK
        string projectId FK
        string key UK
        string type
        string title
        string status
        string priority
        string assigneeId FK
        string reporterId FK
        string sprintId FK
        string epicId FK
        float boardOrder
    }
    LABEL {
        string id PK
        string organizationId FK
        string name
        string color
    }
    ISSUE_LABEL {
        string issueId FK
        string labelId FK
    }
    COMMENT {
        string id PK
        string issueId FK
        string authorId FK
        string parentCommentId FK
        string body
    }
    ATTACHMENT {
        string id PK
        string issueId FK
        string uploadedById FK
        string fileName
        string storageKey
    }
    NOTIFICATION {
        string id PK
        string userId FK
        string type
        string entityType
        string entityId
        boolean isRead
    }
    AUDIT_LOG {
        string id PK
        string organizationId FK
        string actorId FK
        string action
        string entityType
        string entityId
    }
```

## Notes on Reading This Diagram

- `ISSUE ||--o{ ISSUE : "epic parent of"` is a self-relation: an `Issue` of
  type `EPIC` can be the parent of many other issues via `Issue.epicId`.
- `NOTIFICATION.entityId` is intentionally not drawn as a typed FK to a
  single table — it's polymorphic (`entityType` says which table `entityId`
  refers to), documented in `01_Database_Design.md §2.12`.
- This diagram is the source that `diagrams/er-diagram.mmd` mirrors for
  reuse outside this doc, per `diagrams/README.md`.
