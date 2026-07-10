# Module Documentation

Each MVP module doc follows: Overview, Business Rules, Database, API, UI,
Acceptance Criteria, Validation, Future Scope — see
`templates/module-doc-template.md`.

| # | Module | Doc |
|---|---|---|
| 1 | Authentication | [01_authentication.md](01_authentication.md) |
| 2 | Dashboard | [02_dashboard.md](02_dashboard.md) |
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

Two open items surfaced while authoring these docs need founder input
before Phase 3 generates the Prisma schema and Route Handlers:

- `15_roles.md` — should org `ADMIN` implicitly act as project `LEAD` on
  every project, or is org admin strictly separate from project
  leadership (current default: separate)?
- `03_Database/01_Database_Design.md §6` — Markdown vs. sanitized-HTML
  storage for `Issue.description`/`Comment.body` (current default:
  Markdown source, sanitized at render).
