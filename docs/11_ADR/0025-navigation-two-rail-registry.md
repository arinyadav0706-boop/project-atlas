# ADR-0025 — Navigation: Registry-Driven Two-Rail Sidebar

- Status: Accepted
- Date: 2026-07-24
- Deciders: Founding team
- Design detail: `docs/01_Architecture/07_Navigation_Architecture.md`

## Context

The global sidebar is a flat, ungrouped list (Home, Projects, +Admin for
admins). It reads as empty, its role differences look arbitrary, and adding a
module requires editing the sidebar component — diverging from the registry
idioms already used for reports (ADR-0020), admin sections (ADR-0022), and
feature flags (ADR-0023). We need a navigation architecture that looks
intentional now and absorbs future modules without rework. Full analysis
(industry comparison, options, trade-offs) lives in the design doc above; this
ADR records the decision.

## Decision

### 1. Two-rail navigation

- A **global rail** — grouped into **Personal / Workspace / Administration**
  sections, with **Admin** and the **account/profile** control bottom-anchored
  (account moves out of the top bar).
- A **contextual project rail** that appears inside `/projects/[id]` for
  project tools (Board, Backlog, Sprints, Reports, Components & Labels,
  Settings), so the global rail doesn't balloon as projects grow.

Global search (⌘K) stays a top-bar action; the notification **bell** stays for
ambient peeking, with an **Inbox** nav destination for triage.

### 2. A Navigation Registry is the single source of nav items

Every item — global and contextual — is a declarative registry entry
(`id/label/icon/href/section/scope/order/visible(actor,ctx)/badge?`). The
sidebar renders whatever the registry yields; a new module self-registers one
entry and never touches the sidebar component. `scope` (`global` | `project`)
partitions the two rails from one registry. This is the same seam idiom as
ADR-0020/0022/0023 — no new architectural concept.

Visibility is resolved **server-side** (authenticated / capability / project
role / feature flag). The registry governs *visibility and placement only* —
**authorization remains the service layer's job** (Coding Standards §7); a
hidden item is still enforced on its route. Registry gating is UX convenience.

### 3. One personal surface for the MVP (Home = My Work)

EAGLES' Home is already the unified personal attention model (ADR-0012), so it
*is* effectively "My Work." The MVP keeps a **single** personal surface — no
separate My Work item (that would be ~80% duplication, CLAUDE.md rule #10).
**My Work** is promoted to its own registry entry only when Home gains
non-personal content (org/team insights, cross-project reporting) — an additive
split with a concrete trigger (design doc §7).

### 4. Role behavior

Members and Leads share the **global** rail; **Lead** differs only in the
**contextual** rail (project Settings etc.); **Admin** adds the bottom-anchored
Admin entry. One `visible` predicate per item — no per-role sidebars.

## Consequences

- Adding a nav destination = one registry entry (+ optional flag gate for a dark
  launch); the sidebar component is never edited.
- The grouped, anchored rail fixes the "empty" perception for every role without
  padding it with dead links.
- Delivery is phased (design doc §12): **B** grouped global rail on the registry
  (now) → **C** contextual project rail (MVP) → growth/enterprise items later.
- Deferred, logged (rule #13): the contextual rail, Inbox badge counts, My Work
  (on trigger), collapsible/persisted sections, org switcher, and per-user
  customization — all additive behind the registry.
- Trade-off accepted: a small upfront registry abstraction, justified by it being
  a thrice-proven pattern and shipped alongside the visible grouping so it earns
  its place immediately.
