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
| Comments | ⛔ | Build | — |
| Attachments | ⛔ | Build (StorageAdapter, ADR-0004) | — |
| Notifications | ⛔ | Build | Comments, Issues events |
| Reports | ⛔ | Build (velocity/burndown/cycle-time) | Sprint, audit log |
| Search | ⛔ | Build (⌘K global + per-list) | Issues, Labels |
| Labels / Components | ⛔ | Wire (tables exist) | — |
| Epics / Versions | ⛔ | First-class planning lanes | Issues |
| Admin / User Mgmt | ⛔ | Build | — |
| Profile | ⛔ | Build | Auth |
| **Deploy pipeline (GL-4/DB-2)** | 🟡 held | Prod migration baseline + `migrate deploy` | prod access |

---

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
