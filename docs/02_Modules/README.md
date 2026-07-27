# Module Documentation

Each MVP module doc follows: Overview, Business Rules, Database, API, UI,
Acceptance Criteria, Validation, Future Scope — see
`templates/module-doc-template.md`.

| # | Module | Doc |
|---|---|---|
| 1 | Authentication | [01_authentication.md](01_authentication.md) |
| 2 | Home (was Dashboard) | [02_home.md](02_home.md) |
| 3 | Projects | [03_projects.md](03_projects.md) |
| 4 | Issues | [04_issues.md](04_issues.md) |
| 5 | Board | [05_board.md](05_board.md) |
| 6 | Backlog | [06_backlog.md](06_backlog.md) |
| 7 | Sprint | [07_sprint.md](07_sprint.md) |
| 8 | Comments | [08_comments.md](08_comments.md) |
| 9 | Attachments | [09_attachments.md](09_attachments.md) |
| 10 | Notifications | [10_notifications.md](10_notifications.md) |
| 11 | Reports | [11_reports.md](11_reports.md) |
| 12 | Search | [12_search.md](12_search.md) |
| 13 | Admin | [13_admin.md](13_admin.md) |
| 14 | User Management | [14_user_management.md](14_user_management.md) |
| 15 | Roles | [15_roles.md](15_roles.md) |
| 16 | Profile | [16_profile.md](16_profile.md) |

Two design questions were flagged here during authoring; both were decided by
founders (2026-07-12), and the first was later revised:

- Org `ADMIN` **is an effective project `LEAD`** on every project in its org
  (**ADR-0024, 2026-07-23**, reversing the original 2026-07-12 "strictly
  separate powers" decision). The elevation is authorization-only (no
  membership rows) and never crosses tenants (F-1). See `15_roles.md`.
- `Issue.description`/`Comment.body` are stored as **Markdown source**,
  sanitized at render time. Rationale: Jira uses its proprietary ADF
  (JSON) and Asana a restricted HTML subset — both exist to serve
  realtime collaborative editing we don't need in V1; Markdown is
  portable, safe when sanitized, and convertible to a richer format
  later if V2+ ever requires it. See
  `docs/03_Database/01_Database_Design.md §6`.
