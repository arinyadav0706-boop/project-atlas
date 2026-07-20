# ADR-0012: Home — Unified Attention Model (not per-module gadgets)

**Status:** Accepted
**Date:** 2026-07-20
**Deciders:** Founding CTO; founder (product strategy workshop)

## Context

The post-login landing page is the product's first impression and the screen
users open most. The inherited "Dashboard" concept — a configurable grid of
gadgets/charts — is Jira's, and it is the wrong model: it is passive
(monitoring, not doing), it accretes clutter as modules multiply, and every
team ends up ignoring or fighting it. EAGLES is meant to out-class Jira/Linear/
ClickUp over 10+ years, so the landing page's *architecture* — not just its
styling — must stay calm and useful from 5 users to 20,000, and from today's few
modules to a V5 with Roadmaps, Goals, Approvals, Forms, Portfolios, Knowledge
Base, and Time Tracking.

The failure mode to design against is concrete: **one widget per new module**,
until the landing page is a wall of boxes nobody reads.

## Decision

The landing page is **Home** (not "Dashboard"): a **personal action launchpad**
answering *"what needs my attention — now let me act on it."*

Home has a **fixed, frozen set of sections**: **My Work**, **Needs your
attention**, **Continue working**, **Due soon**, **Starred + recent projects**.

**New modules feed these sections; they never add a new Home section.** The
mechanism is a **unified attention model**:

- **Needs your attention** is a single ranked stream produced by composing
  independent **`AttentionSource`** contributors. Each source yields uniform
  `AttentionItem { id, kind, title, href, actorId?, occurredAt }`. Approvals,
  @mentions, review requests, goal check-ins, etc. each become a *source*, not a
  widget. Home renders the merged, ranked stream without knowing the sources.
- **My Work / Continue working / Due soon** are personal, cross-module views
  over issues (and later, other assignable/engageable entities) — extended by
  entity type, not by new tiles.

Consequences of the model:
- Reporting/charts are **not** on Home → they live in the future **Reports**
  module.
- The org-wide project **catalog** is **not** on Home → Projects module. Home
  shows only a small personal starred/recent strip.
- Top-level navigation stays lean (~5–7 items); scale is absorbed by nesting,
  global search/⌘K, and pins — never by more tabs or more Home widgets.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Configurable gadget dashboard (Jira)** | Clutter, decision fatigue, passive, ignored by ICs; the exact mistake we exist to beat. |
| **One widget per module** | Landing page grows without bound; becomes the Jira grid by V5. |
| **Auto-land on last-visited screen** | Non-deterministic, disorienting; continuity belongs *inside* Home ("Continue working"), with a fixed, predictable landing. |
| **Call it "My Work"** | Accurate for the hero section but too narrow as the durable page name; "Home" is the container that survives new sections. |

## Consequences

- **Positive:** Home's *structure is frozen*; only the *ranking of one unified
  stream* gets smarter over time. It stays calm and identical in spirit from MVP
  to enterprise. New modules integrate by implementing a contract, with zero
  Home redesign — the property that proves the architecture is right.
- **Negative / trade-offs accepted:** a new module can't just "drop a box on the
  home page" — it must express its signal as an `AttentionSource` (or a
  cross-module personal view). This is a deliberate constraint that trades
  one-off convenience for long-term coherence.
- **Follow-up actions:**
  1. Home module: the five sections, `AttentionSource` contract, bounded +
     streamed per Performance doc.
  2. `RecentItem` (engagement signal) + `Favorite` (explicit pins) — generic,
     per-user, entity-typed tables (see `03_Database`).
  3. Reporting stays out of Home (Reports module, later).
  4. Keep top-level nav lean; introduce global search/⌘K + pins as the at-scale
     navigation primitives.
