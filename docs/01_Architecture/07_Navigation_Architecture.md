# 07 — Global Navigation Architecture

**Status:** Draft for review (design only — no implementation) · **Owner:** Founding CTO · **Last Updated:** 2026-07-24

> Design document for the EAGLES left sidebar / global navigation. This captures
> the architecture decision *before* building, per the documentation-first rule.
> A short ADR should ratify the two-rail + registry decision when we proceed.

## 1. Problem Statement

The global sidebar shows **Home, Projects** (Members) and **Home, Projects,
Admin** (Admins). It reads as visually empty and unfinished, and the
Member/Admin difference of a single inline item feels arbitrary. An ad-hoc flat
list will not scale as modules grow, forces a sidebar-component edit per feature,
and diverges from the registry idioms already used elsewhere (reports ADR-0020,
admin sections ADR-0022, feature flags ADR-0023).

We need a navigation **architecture** — not a cosmetic patch — that looks
intentional today with the modules we actually have and absorbs future modules
without rework.

## 2. Design Goals

1. **Looks intentional at any size** — sparse-but-structured beats padded filler.
2. **Modular / plugin-friendly** — a new module registers a nav entry; the
   sidebar component never changes.
3. **Scalable** — works at 3 items and at 30 (grouping, overflow, contextual rail).
4. **Role-aware** — Member / Lead / Admin see a coherent subset via one
   visibility rule, not hardcoded branches.
5. **Consistent with modern SaaS** (two-rail, bottom-anchored admin/account)
   without cloning any one product.
6. **Honest** — no placeholder menus to dead ends (CLAUDE.md rule #10).
7. **Portable & server-safe** — visibility resolved server-side (role/flag),
   consistent with our RBAC posture; nav gating is UX, never the security boundary.

## 3. UX Analysis — why it feels empty

- **No visual grouping.** A flat, unlabeled list with generous whitespace reads
  as empty. Section headers create rhythm and imply structure even with few items.
- **Under-surfaced features.** Notifications exists (bell only); rich project
  tools (Board/Backlog/Sprints/Reports) have **zero** left-rail presence — they
  live behind horizontal tabs once inside a project. The nav under-represents the
  product.
- **No anchoring.** Everything floats at the top. Mature apps anchor personal
  items at top and admin/account at the bottom, framing the middle as deliberate.

Key insight: **Jira/Linear/Asana don't have more top-level items than us — they
present them better** (grouped, two-rail, anchored).

## 4. Industry Comparison

| Product | Global rail | Contextual rail | Admin | Account | Home model |
|---|---|---|---|---|---|
| **Jira** | Your Work, Projects, Filters, Dashboards, Teams, Apps (grouped) | Yes — per-project (Board, Backlog, Sprints, Reports, Settings) | Separate ⚙ Settings area | Avatar bottom-left | **Dashboards ≠ Your Work** (split) |
| **Linear** | Inbox, My Issues, then Workspace | Team/project sections expand inline | Settings = full-screen route | Switcher top | **No Home** — task list is the landing |
| **Asana** | Home, My Tasks, Inbox, Reporting, Portfolios | Project tabs across top | Admin Console separate | Account bottom-left | **Home (overview) + My Tasks (list)** |
| **GitHub** | Dashboard (feed + your PRs/issues) | Repo context switches | Separate admin | Avatar top-right | Dashboard blends activity + personal work |
| **GitLab** | "Your Work" area (issues/MRs/to-dos) | Yes — dominant model | Admin Area route | Avatar top-right | **Home ≈ Your Work (merged)** |

**Patterns worth adopting (not copying):** two rails (Jira, GitLab);
personal-first ordering (Linear, Asana); admin & account anchored/segregated;
quiet section labels. **Anti-patterns:** Jira's density; placeholder items to
nowhere; forcing identical nav on all roles.

## 5. Navigation Options (trade-offs)

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A — Flat + more items** | Just add items to today's flat list | Trivial | Still ungrouped/empty; no modularity; no scale | Rejected |
| **B — Grouped global rail** | Sections (Personal/Workspace) + bottom-anchored Admin/account; project tools stay tabs | Big perceived-fullness win, near-zero backend; role diff looks intentional | Project depth still in tabs; not yet plugin-driven | Good MVP step |
| **C — Two-rail** | B + contextual project rail (Board/Backlog/Sprints/Reports/Components&Labels/Settings) | Real "Jira/GitLab feel"; scales; separates global vs project cognition | More layout work; rail transitions + mobile | Target architecture |
| **D — Registry-driven two-rail** | C, but every item (global + contextual) comes from a Navigation Registry with declarative visibility | Modular, plugin-friendly, flag-gated, role-aware in one place; matches existing idiom | Slight upfront abstraction | End state |

## 6. Recommended Approach

**Adopt Option D as the architecture, delivered B → C, both built on the
registry from the start.** The registry is cheap and already proven three times
(reports, admin sections, feature flags). Building the grouped rail (B) *on* the
registry makes C and every future module additive — immediate visual win now,
scalable structure without a later rewrite.

## 7. Home vs. My Work (resolved)

**Decision: for the MVP, one surface — keep Home; do NOT ship a separate My
Work.** Introduce My Work later, on a concrete trigger.

Reasoning: EAGLES' Home is not a generic dashboard — per **ADR-0012** it is the
**unified personal attention model** (My Work, Continue working, Due soon,
Attention inbox, Projects strip). So Home *already is* effectively My Work.

- Two distinct *jobs* exist: **"orient me"** (a glanceable overview / dashboard)
  and **"what do I do next"** (an exhaustive, filterable personal work queue).
- Industry rule observed across the five products: teams only split these into
  two nav items once **Home carries non-personal content** (org dashboards, team
  reporting, activity feeds). Focused products (Linear, GitLab) keep **one**
  surface; broad/configurable ones (Jira, Asana) split.
- EAGLES today has **no org-level content**, so a separate My Work would be
  ~80% duplication of Home's "My Work" section — the classic MVP redundancy trap
  (rule #10). EAGLES is currently closer to the Linear/GitLab posture.

**Evolution trigger (when to split):** the day Home gains non-personal content
(org/team insights, cross-project reporting, activity) such that a user's actual
tasks would fall below the fold, promote **My Work** to its own nav item:
- **Home** → the overview/dashboard ("orient me"), moving toward Asana/Jira.
- **My Work** → the dedicated personal work queue across all projects, fully
  filterable/sortable ("do next"), the Linear/GitLab list.

This split is **additive** via the registry — Home stays, My Work slots in as a
new entry — so deferring costs nothing.

**Low-cost hedge now (optional):** make Home's existing "My Work" section header
link to a filtered issues view (`assignee = me`). Power users get the full queue
without a redundant top-level item, and that filtered view *becomes* the My Work
page later — reusing the existing issues list, nothing new structurally.

## 8. Navigation Information Architecture

**Global rail (grouped, bottom-anchored):**

```
[ Org / workspace name ▸ ]        ← header (org switcher placeholder; single-org today)
──────────────────────────
 PERSONAL
   Home                            ← personal attention landing (ADR-0012); = "My Work" for MVP
   Inbox                           ← notifications page (bell stays for ambient peek)
──────────────────────────
 WORKSPACE
   Projects
   (My Work — added on the §7 trigger)
   (Org Reports/Insights — future)
──────────────────────────
        · spacer ·
──────────────────────────
 Admin                             ← bottom-anchored, capability-gated
 [ Avatar ⌄ ]  Profile · Sign out  ← account moves from top bar to sidebar
```

**Contextual rail (inside `/projects/[id]`):**

```
‹ Projects
  ENG — Engineering
    Board
    Backlog
    Sprints
    Reports
    Components & Labels
    Settings                       ← project LEAD / org admin (effective LEAD, ADR-0024)
```

Global search (⌘K) stays in the **top bar** — it's an action, not a destination.
The top bar becomes: search + notification bell only.

## 9. Role Visibility Matrix

| Nav item | Viewer | Member | Lead | Admin | Gate |
|---|---|---|---|---|---|
| Home | ✅ | ✅ | ✅ | ✅ | authenticated |
| Inbox | ✅ | ✅ | ✅ | ✅ | authenticated |
| Projects | ✅ | ✅ | ✅ | ✅ | authenticated |
| Project → Board/Backlog/Sprints/Reports | ✅ (read) | ✅ | ✅ | ✅ | project visibility (org-visible, 03_projects BR-7) |
| Project → Settings | ❌ | ❌ | ✅ | ✅ | `canManageProject` (effective LEAD, ADR-0024) |
| Admin | ❌ | ❌ | ❌ | ✅ | `hasCapability(MANAGE_*)` (ADR-0022) |
| Profile / Account | ✅ | ✅ | ✅ | ✅ | authenticated |
| My Work *(future)* | ✅ | ✅ | ✅ | ✅ | authenticated (on §7 trigger) |

Only **Admin** varies the *global* rail (hence bottom-anchoring). **Lead** varies
only the *contextual* rail (project Settings). No per-role sidebars — one
predicate per item.

## 10. Navigation Registry Architecture (conceptual)

A single declarative source of nav items; the sidebar renders whatever the
registry yields for the current actor/context. The security boundary stays in the
service layer — the registry decides *visibility & placement*, never *authorization*.

Each entry declares:

| Field | Purpose |
|---|---|
| `id`, `label`, `icon`, `href` | identity + rendering |
| `section` | `personal` \| `workspace` \| `admin` \| `account` |
| `scope` | `global` \| `project` (which rail it appears in) |
| `order` | ordering within its section |
| `visible(actor, context)` | server-side predicate: authenticated / capability / project-role / **feature-flag** |
| `badge(actor)` *(optional)* | e.g. Inbox unread count |

Properties: plugin-friendly (new module = one entry, no sidebar edit); role-aware
in one place; flag-gated nav (dark launches, ADR-0023); both rails from one
registry (`scope` partitions them); consistent badges. This is the same
registry/seam idiom as ADR-0020/0022/0023 — no new architectural concept.

## 11. Scalability Considerations

- **Bounded height:** collapsible sections; a "More" overflow for long tails;
  contextual rail offloads project tools from the global rail.
- **Perf:** visibility predicates are cheap (role/flag already on the
  request-cached actor + one flag map). Badges lazy/polled — never block first paint.
- **Responsive:** existing icon-rail collapse extends to sections (icons +
  tooltips); contextual rail becomes a selector/drawer on small screens.
- **Multi-workspace (future):** header org switcher + `scope: workspace` already
  anticipate it; no IA rework.
- **Consistency:** one registry → uniform ordering, gating, and badges across
  every module and both rails.

## 12. Phased Roadmap

| Phase | Scope | Effort | Outcome |
|---|---|---|---|
| **Now (quick win)** | Introduce the registry; group the global rail (Personal/Workspace); add **Inbox**; bottom-anchor **Admin**; move **account** to sidebar bottom. (No separate My Work — §7.) | Small | "Empty" → "structured" for all roles; modular foundation |
| **MVP** | **Contextual project rail** via `project`-scoped registry entries; Inbox badge count | Medium | Real Jira-class depth; project tools discoverable |
| **Growth** | Collapsible sections + persisted state; **My Work** (on §7 trigger); org-level Reports/Insights; saved views; flag-gated dark launches | Medium | Handles 10–20 destinations gracefully |
| **Enterprise** | Org/workspace switcher (multi-tenant); per-user pinning/customization; plugin-marketplace entries; delegated-admin-scoped nav | Larger | Multi-workspace + extensibility ceiling |

## 13. Risks & Trade-offs

- **Over-abstracting early** → the registry is a thin, proven pattern; ship the
  visible grouping in the same step so it earns its place immediately.
- **Two rails add complexity** (transitions, mobile, "where am I?") → clear
  active-context header + "‹ back to Projects".
- **Registry visibility mistaken for security** → document that service checks
  remain the boundary; nav gating is cosmetic.
- **Emptiness persists if we ship only the registry** → the grouping + Inbox are
  what fix the *feeling*; don't ship the registry alone.
- **Scope creep into speculative modules** → only register entries that route to
  real, shipped destinations.

## 14. Final Recommendation

Adopt **registry-driven two-rail navigation** (Option D), sequenced **B → C**:

1. **Immediately:** build the Navigation Registry and reskin the global rail into
   grouped sections (Personal / Workspace / Administration + Account), add
   **Inbox**, bottom-anchor **Admin**, move **account** to the sidebar. Keep
   **Home only** (it is effectively My Work — §7).
2. **Next (MVP):** add the **contextual project rail** from `project`-scoped
   registry entries — the real depth jump.
3. **Later:** grow sections, badges, **My Work** (on trigger), org switcher, and
   customization on the same registry.

This keeps EAGLES modular, scalable, role-aware, and plugin-friendly; aligns with
Jira/Linear/Asana/GitLab conventions without cloning them; reuses the established
registry idiom; and avoids MVP redundancy by keeping one personal surface until
Home earns a second.
