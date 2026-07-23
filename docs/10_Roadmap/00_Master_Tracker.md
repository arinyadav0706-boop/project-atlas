# 00 — Master Launch Tracker

**The single at-a-glance status board for every module before Internal GA.**
Companion to `01_Development_Roadmap.md` (phases) and `02_Backlog_and_Tech_Debt.md`
(cross-cutting debt). Update the tick + notes in the same PR that changes a module.

**Legend:** ✅ done · 🟡 partial (usable, gaps below) · ⛔ not started
**Column meaning:** **Launch** = must be true before Internal GA. **Later** = a real
Jira feature we can add post-parity without blocking. **Dep** = blocked by another
module (can't finish until that ships).

---

## Module status (top level)

| Module | State | Must-fix before launch | Depends on |
|---|---|---|---|
| Auth / SSO | ✅ | Rotate seeded passwords (GL-1); SSO creds if launching SSO (GL-6) | — |
| Projects & Roles | ✅ | — | — |
| Issues | ✅ | — | — |
| Board | ✅ | Activate Sprint/Epic/Label filters (FUT-4) | Labels, Epics |
| Home | ✅ | — | — |
| **Backlog** | 🟡 | (in-module done) search/filters remain | Search, Labels/Epics |
| **Sprint** | 🟡 | (in-module done) burndown remains | Reports (burndown) |
| Comments | 🟡 | (MVP done) threads/mentions/reactions/rich-text later | (future features) |
| Attachments | 🟡 | (MVP done) previews/versioning/scan/dedup/quota/share-links later; set `STORAGE_*` env in prod (GL-8) | — |
| Notifications | 🟡 | (MVP done) @mentions, real-time, email later | Comments, Issues events |
| Reports | ⛔ | Build (velocity/burndown/cycle-time) | Sprint, audit log |
| Search | ⛔ | Build (⌘K global + per-list) | Issues, Labels |
| Labels / Components | 🟡 | (MVP done + board chips/filter) list-row/backlog chips remain | — |
| Epics / Versions | ⛔ | First-class planning lanes | Issues |
| Admin / User Mgmt | ⛔ | Build | — |
| Profile | ⛔ | Build | Auth |
| **Deploy pipeline (GL-4/DB-2)** | 🟡 held | Prod migration baseline + `migrate deploy` | prod access |

---

## Comments — feature checklist (ADR-0016)

- [x] Post / list (keyset, oldest-first) / edit own (OCC) / delete own (LEAD any) ✅ 2026-07-21
- [x] Escaped body render (XSS boundary); `bodyFormat` seam; audit/event seam ✅ 2026-07-21
- [ ] **Threaded replies** (render off `parentCommentId`) — *later, column exists*
- [ ] **@mentions** (`comment_mentions`) — *Dep: Notifications*
- [ ] **Reactions** (`comment_reactions`) — *later*
- [ ] **Attachments** (`attachments.commentId`) — *Dep: Attachments*
- [ ] **Rich-text editor** (swap renderer off `bodyFormat`) — *later*
- [ ] **Edit history** (`comment_revisions`) — *later*
- [ ] **Real-time / AI summaries** (subscribe the event seam) — *Dep: infra / AI*

## Attachments — feature checklist (ADR-0017)

- [x] Upload (multipart, MIME allow-list + 25 MB cap) / list / RBAC-gated download / delete (uploader or LEAD) ✅ 2026-07-22
- [x] Provider-agnostic `StorageAdapter` (Local default; Supabase via REST) + factory (`STORAGE_PROVIDER`) ✅ 2026-07-22
- [x] Opaque server-side keys; drag-drop + multi-file picker; audit on upload/delete; soft delete + best-effort blob removal ✅ 2026-07-22
- [ ] **S3 / GCS / Azure adapters** (new class + factory case — no feature-code change) — *later*
- [ ] **Signed-URL download + expiring share links** (documented seam) — *later*
- [ ] **Image/PDF previews & thumbnails** (`previewUrl` additive) — *later*
- [ ] **Versioning** (supersede-by-key) / **dedup** (`hash`) / **virus scanning** (`scanStatus`) — *later*
- [ ] **Per-project storage quotas** + parallel bulk upload — *later*
- [ ] **Comment attachments** (`attachments.commentId`) — *Dep: Comments wiring*
- [ ] **AI document processing** (subscribe the upload event seam) — *Dep: AI*

## Labels & Components — feature checklist (ADR-0018)

- [x] Labels: org-scoped entity; member create+apply, LEAD/ADMIN manage; case-insensitive dedup (functional index) ✅ 2026-07-23
- [x] Components: project-scoped; LEAD CRUD; multi-per-issue; default-assignee routing (BR-3) ✅ 2026-07-23
- [x] Issue-detail pickers (inline label create) + chips; management in Project Settings ✅ 2026-07-23
- [x] Board filter *query* support for `labelIds` + `componentIds` ✅ 2026-07-23
- [x] **Filter controls** (label/component multiselect) in the Board filter bar ✅ 2026-07-23
- [x] **Chips on board cards** (labels + components) ✅ 2026-07-23
- [ ] Chips on list rows / backlog rows + Backlog filter bar — *optional additive `IssueListItemDto` fields exist; other views not yet wired*
- [ ] **Label creation-lockdown toggle** (Phase 2), label merge, usage counts — *ADR-0018, deferred*
- [ ] **Component board swimlanes**, component lead as watcher — *deferred*

## Notifications — feature checklist (ADR-0019)

- [x] Bell (unread badge, poll) + dropdown + `/notifications` history page ✅ 2026-07-23
- [x] Triggers: ASSIGNED (create/update/component-owner), COMMENT_ADDED, STATUS_CHANGED → assignee + reporter, actor excluded, `notificationsEnabled` honored ✅ 2026-07-23
- [x] Per-recipient rows + precomputed message; mark-read / mark-all-read; keyset list ✅ 2026-07-23
- [ ] **@mentions** (`MENTIONED`) — *needs comment @mention parsing (ADR-0016)*
- [ ] **Commenter-participation** recipients on comment/status events — *deferred (ADR-0019)*
- [ ] **Real-time push** (websockets) + **email digest** — *outbox/bus seam behind NotificationService*
- [ ] **Per-notification-type preferences** + explicit watch/follow — *today: one global toggle*

## Backlog — feature checklist

- [x] Ordered unscheduled list (rank), drag-reorder, keyset pagination
- [x] Drag issue → sprint / back; per-row "…" move menu
- [x] VIEWER read-only, RBAC, optimistic + OCC
- [x] **Inline "create issue" at bottom of backlog** (Jira fast-add) ✅ 2026-07-21
- [ ] **Backlog text search** — *Dep: Search (SP-2)*
- [ ] **Filters** (assignee/type/priority/epic/label) — *Dep: Labels/Epics (SP-3)*
- [ ] **Epics panel / group-by-epic** — *Dep: Epics — later*
- [ ] **Versions/releases panel** — *Dep: Versions — later*
- [x] **Bulk select + bulk move** (SP-8) ✅ 2026-07-21
- [ ] **Inline edit** assignee/points/labels from a row — *Dep: Labels — later*

## Sprint — feature checklist

- [x] Create · multiple planned sprints · start (dates+goal) · complete · edit · delete
- [x] Multi-sprint sections (ADR-0015) · history · dates + overdue · count progress
- [x] Star project · row "…" move · duration/issue-count · RBAC · OCC
- [x] **Complete → move incomplete to *next sprint*** (FUT-5) ✅ 2026-07-21
- [x] **Reorder the sprint queue** (up/down; FUT-8) ✅ 2026-07-21
- [ ] **Burndown / velocity** — *Dep: Reports (SP-1); data already in audit_logs*
- [ ] **Sprint capacity** (points vs capacity) — *later*
- [ ] **Duration presets** (1w/2w) + auto start/complete — *later*

## Cross-cutting (surfaces in Backlog/Sprint, owned elsewhere)

- [ ] **Search ⌘K** (SP-4) — *Search module*
- [ ] **Notifications** bell + badge (SP-5) — *Notifications module*
- [ ] Two-column/Details layout, inline goal-edit (SP-6/7) — *premium re-skin (UX-1)*

---

## Pre-launch global gates (from `02_Backlog_and_Tech_Debt.md`)

- [ ] **GL-1** rotate/remove seeded known-password accounts
- [ ] **GL-2** full security review (Phase 7)
- [ ] **GL-3** rate limiting on auth + mutations
- [ ] **GL-4/DB-2** prod migration baseline + apply all indexes; wire `migrate deploy`
- [ ] **GL-5** `DATABASE_URL` connection_limit=1
- [ ] **GL-6** SSO creds (if launching with SSO)
- [ ] **GL-7** load test ~60 concurrent
- [ ] **UX-1** premium re-skin (after MVP functionally complete)

---

## How to read "Later" vs "Launch"

- **Launch** items are the honest minimum for a team to plan+run sprints and not hit
  walls. Keep this list short and real.
- **Later** items are genuine Jira features intentionally deferred (over-parity for V1,
  or cheaper once a dependency exists). They live here so nothing is *forgotten* — not
  because they're required. Promote a "Later" → "Launch" only with a founder decision.
