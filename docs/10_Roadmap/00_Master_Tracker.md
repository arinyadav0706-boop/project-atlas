# 00 — Master Launch Tracker

**The single at-a-glance status board for every module before Internal GA.**
Companion to `01_Development_Roadmap.md` (phases) and `02_Backlog_and_Tech_Debt.md`
(cross-cutting debt). Update the tick + notes in the same PR that changes a module.

**Last reconciled against the codebase: 2026-08-07.**

> **Why that line exists.** Between 2026-07-23 and 2026-08-07 this file went
> unedited through ~40 merged PRs and drifted badly — it still listed Search,
> Epics, Admin/User Management and Profile as ⛔ *not started* when all four had
> shipped, and had no row at all for Teams, Time tracking, Workload or the chart
> kit. Since the Phase 8 go/no-go reads this table, it was understating our
> position on five modules. If you change a module and do not touch this file in
> the same PR, the next person plans against fiction.

**Legend:** ✅ done · 🟡 partial (usable, gaps below) · ⛔ not started
**Column meaning:** **Launch** = must be true before Internal GA. **Later** = a real
Jira feature we can add post-parity without blocking. **Dep** = blocked by another
module (can't finish until that ships).

---

## Module status (top level)

### V1 — core Jira parity

| Module | State | Must-fix before launch | Depends on |
|---|---|---|---|
| Auth / SSO | ✅ | Rotate seeded passwords (GL-1); SSO creds if launching SSO (GL-6) | — |
| Projects & Roles | ✅ | — | — |
| Issues | ✅ | — | — |
| Board | ✅ | Only the **Sprint** filter control remains (FUT-4); Epic/Label/Component all shipped | — |
| Home | ✅ | — | — |
| **Backlog** | 🟡 | Text search + filter bar still unwired — **dependencies are now satisfied**, this is just not built | (Search ✅, Epics ✅ — unblocked) |
| **Sprint** | 🟡 | (in-module done) burndown remains | Reports (burndown) |
| Comments | 🟡 | (MVP done) threads/mentions/reactions/rich-text later | (future features) |
| Attachments | ✅ | MVP done; `STORAGE_*` configured in prod (GL-8 ✅) — previews/versioning/scan later | — |
| Notifications | 🟡 | (MVP done) @mentions, real-time, email later | Comments, Issues events |
| Reports | 🟡 | (MVP done) burndown/CFD/more via registry | Sprint, audit log |
| Search | ✅ 2026-07-23 | Global ⌘K palette + Postgres FTS (ADR-0021). Per-list search still to wire into Backlog | — |
| Labels / Components | 🟡 | (MVP done + board chips/filter/controls) list-row/backlog chips remain | — |
| **Epics** | ✅ 2026-07-27 | Hierarchy, selector, detail panel, board filter + badges, backlog group-by-epic with cross-epic drag (ADR-0026) | — |
| **Versions / Releases** | ⛔ | Not started — no `Version` model exists. Genuinely V2. | Issues |
| **Admin / Control plane** | ✅ 2026-07-23 | Capabilities, feature flags, audit viewer, org settings (ADR-0022/0023) | — |
| **User Management** | ✅ 2026-07-24 | Users tab — invite, roles, deactivation (module 14) | Admin |
| **Authorization engine** | ✅ 2026-07-24 | Centralized permission engine; org admins are effective LEAD (ADR-0024) | — |
| Profile | ✅ 2026-07-28 | Self-service account settings (ADR-0027) | — |
| **Deploy pipeline (GL-4/DB-2)** | ✅ 2026-07-28 | Prod baselined (13 migrations recorded); `vercel-build` runs `migrate deploy` before build | — |

### V2 — management visibility layer (`docs/00_Product/05_V2_Management_Visibility_Layer.md`)

| Module | State | Notes | Depends on |
|---|---|---|---|
| **Time tracking** (Epic 1) | ✅ 2026-08-05 | Estimates + work logs end to end; LEAD-gated estimate governance; estimate at issue creation (ADR-0030) | Issues |
| **Teams & Hierarchy** (Epic 2) | ✅ 2026-08-05 | The people axis — org/team model, manager visibility (ADR-0031/0032) | Users |
| **Workload** (Epic 3) | ✅ 2026-08-07 | Cross-project load per person (ADR-0034); per-org working week; team-mix + capacity charts; **time-phased people × weeks grid** (ADR-0035) | Time tracking, Teams |
| **Scheduling engine** | ✅ 2026-08-07 | `features/scheduling` — resolves *when* work happens (ADR-0035). Shared seam for Gantt/Calendar | — |
| **Chart kit** | ✅ 2026-08-06 | Apache ECharts as the single charting standard (ADR-0036); velocity, donut, distribution, capacity bars | — |
| **Views: Timeline/Gantt, Calendar** (Epic 6) | ⛔ | Not started. Consumes `features/scheduling`; **owns the `Issue.startDate` decision** (backlog WL-4) | Scheduling ✅ |
| **Demo data (VERUS)** | ✅ 2026-08-05 | ~150 users / ~8k issues, one-click seed workflow (ADR-0033). **Must never reach a client DB — GL-9** | — |

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

## Reports — feature checklist (ADR-0020)

- [x] Pluggable **report registry** (`REPORTS` map; API dispatches by id, UI renders by chartType) ✅ 2026-07-23
- [x] Velocity (bar), Status breakdown (donut), Cycle time (KPI) — read-only over issues/sprints/audit_logs, no new tables ✅ 2026-07-23
- [x] ~~Reports tab + hand-rolled SVG charts~~ → **rebuilt on Apache ECharts** (ADR-0036); the SVG kit was deleted rather than left as a second system ✅ 2026-08-06
- [ ] **Burndown** (`line`) — first post-MVP registry add (active-sprint DONE events across dates). **The last thing keeping Sprint at 🟡.**
- [ ] **Committed-vs-completed velocity** — needs a `committedPoints` snapshot at sprint close
- [ ] CFD, cycle/lead-time distributions, workload, epic progress, release reports, custom builder — registry adds
- [ ] Compute cache / pre-aggregation — scale seam behind `compute`

## Backlog — feature checklist

- [x] Ordered unscheduled list (rank), drag-reorder, keyset pagination
- [x] Drag issue → sprint / back; per-row "…" move menu
- [x] VIEWER read-only, RBAC, optimistic + OCC
- [x] **Inline "create issue" at bottom of backlog** (Jira fast-add) ✅ 2026-07-21
- [x] **Epics panel / group-by-epic** — collapse/expand, No-Epic bucket, cross-epic drag ✅ 2026-07-27
- [ ] **Backlog text search** — ~~*Dep: Search*~~ **unblocked** (Search shipped 2026-07-23); simply not wired into this surface yet
- [ ] **Filters** (assignee/type/priority/epic/label) — ~~*Dep: Labels/Epics*~~ **unblocked** (both shipped); the Board's filter bar is the pattern to copy
- [ ] **Versions/releases panel** — *Dep: Versions — genuinely not started*
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

## Workload — feature checklist (ADR-0034 / ADR-0035)

- [x] Cross-project remaining effort per person; unestimated counted, never imputed (BR-4) ✅ 2026-08-06
- [x] Per-organization working week drives every capacity figure (8h×5, 9h×5, 6h×6…) ✅ 2026-08-06
- [x] Team-mix stacked bar + per-person capacity bars on the ECharts kit ✅ 2026-08-06
- [x] **Time-phased people × weeks grid** — Overdue · 4 real-dated weeks · Later · Unscheduled; hours + % of capacity; sprint-inferred cells marked `S` ✅ 2026-08-07
- [ ] **Cell drill-in** — click a cell to list the issues behind it (backlog WL-5)
- [ ] **Per-person capacity** (part-time, leave calendar) — backlog WL-1
- [ ] **`Issue.startDate`** — backlog WL-4, *owned by the Gantt/Timeline module*
- [ ] Descendant-team roll-up + drag-to-reassign from a row — backlog WL-2

## Cross-cutting (surfaces in Backlog/Sprint, owned elsewhere)

- [x] **Search ⌘K** (SP-4) — global palette in the top bar ✅ 2026-07-23
- [x] **Notifications** bell + badge (SP-5) ✅ 2026-07-23
- [ ] Two-column/Details layout, inline goal-edit (SP-6/7) — *premium re-skin (UX-1)*

---

## Pre-launch global gates (from `02_Backlog_and_Tech_Debt.md`)

- [ ] 🚩 **GL-1** rotate/remove seeded known-password accounts — *code done; the **prod rotation** has not happened*
- [ ] 🚩 **GL-2** full security review (Phase 7) — `/security-review` + a manual pass
- [x] **GL-3** rate limiting on auth + mutations ✅ 2026-07-30 (ADR-0028)
- [x] **GL-4/DB-2** prod migration baseline + `migrate deploy` on deploy ✅ 2026-07-28
- [ ] **GL-5** `DATABASE_URL` connection_limit=1 — *`pgbouncer=true` confirmed; the flag is still missing*
- [ ] **GL-6** SSO creds (if launching with SSO) — config, not code
- [ ] **GL-7** load test ~60 concurrent
- [x] **GL-8** `STORAGE_*` configured in prod ✅ 2026-07-28
- [ ] 🚩 **GL-9** VERUS demo data absent from any client-handover DB (ADR-0033) — verify `SELECT count(*) FROM organizations WHERE id='verus-demo-org'` is `0`
- [ ] **UX-1** premium re-skin (after MVP functionally complete)

**Honest read: three 🚩 P1 gates remain — GL-1, GL-2, GL-9.** GL-5/6/7 are P2
config-and-validation. Everything else on this list is closed.

---

## How to read "Later" vs "Launch"

- **Launch** items are the honest minimum for a team to plan+run sprints and not hit
  walls. Keep this list short and real.
- **Later** items are genuine Jira features intentionally deferred (over-parity for V1,
  or cheaper once a dependency exists). They live here so nothing is *forgotten* — not
  because they're required. Promote a "Later" → "Launch" only with a founder decision.
