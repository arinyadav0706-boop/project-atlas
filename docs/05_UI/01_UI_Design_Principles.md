# UI Design Principles — EAGLES

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

This document captures the visual/interaction direction ahead of the full
Phase 2 screen-by-screen UI spec (`docs/05_UI/`), because it's a founder
decision that should shape every screen spec written after it, not get
inferred per-screen.

---

## 1. Direction

**Apple-level polish, not Jira/Atlassian-level density.** The bar is: does
this feel like it was designed with the same care as iOS/macOS system
apps — generous whitespace, restrained color, purposeful motion, obvious
affordances — rather than a dense enterprise admin panel. This supersedes
the earlier "inspired by Linear, Notion, Atlassian" note in
`docs/00_Product/01_Product_Vision.md` on visual tone specifically: those
products remain the functional/IA reference (sidebar navigation, board/list
views), but the aesthetic bar is Apple's.

## 2. Color

- **Light theme is the primary, default, designed-first experience.**
  Backgrounds are white/near-white (e.g. `#FFFFFF` / `#FAFAFA`), not black
  or heavy dark-slate surfaces.
- Text is dark neutral gray (e.g. `#1D1D1F`-style near-black), never pure
  `#000000` on pure white — softer contrast, easier to read.
- One restrained accent color drives primary actions/links/focus states;
  status/priority colors (issue states, priority levels) are the only other
  saturated colors on screen, used sparingly (a chip/tag/left-border, not a
  full-background fill).
- Dark mode may exist later as a secondary, opt-in accessibility option
  (the original spec lists it), but it is not the flagship look and must
  never be the default — light is the brand.

## 3. Typography & Spacing

- System font stack (`-apple-system, "SF Pro Text", "SF Pro Display",
  Inter, sans-serif`) — native-feeling, no heavy custom webfont loading.
- Generous line-height and spacing scale (Tailwind's default 4px scale is
  fine); avoid cramming — err toward more whitespace than a typical Jira
  screen.
- Rounded corners (e.g. `rounded-lg`/`rounded-xl`), soft single-level
  shadows for elevation (cards, modals, dropdowns) — no harsh borders as
  the primary separator between sections.

## 4. Motion & Interactivity

- Every state change (opening a panel, dragging an issue card, expanding a
  section) is **animated**, not instant — short, purposeful transitions
  (150–250ms, ease-out), not decorative or slow.
- Board drag-and-drop (see `docs/02_Modules/05_board.md`, Phase 2) uses
  fluid, physics-feeling reordering, not a jump-cut on drop.
- Hover/focus states are always visible and smooth (buttons, list rows,
  cards) — never a UI that only reacts on click.
- **Recommended library:** Framer Motion for React, alongside Tailwind CSS
  + shadcn/ui (already chosen in `03_Technology_Stack.md`) — shadcn's
  Radix-based primitives already support the animation hooks Framer Motion
  needs, so this is additive, not a stack change.

## 5. Reversibility ("rollback") as a UI Pattern

Because the architecture already mandates soft-delete and audit trails
(no hard deletes — `docs/01_Architecture/04_Coding_Standards.md`), the UI
should make that safety net visible to the user, not just the database:

- Destructive or state-changing actions (delete issue, close sprint, change
  status) surface a toast with an **Undo** action for a short window
  (~6–8 seconds) before the change is treated as final in the UI.
- Navigating away from an in-progress form (e.g., a half-filled issue)
  should not silently discard input — confirm or preserve draft state.
- This is a UX expectation to carry into every module's Acceptance Criteria
  in Phase 2, not a one-off feature.

## 6. Accessibility

- Apple-level polish must not come at the cost of accessibility: shadcn/ui
  (Radix-based) gives keyboard navigation and ARIA semantics by default —
  don't override that away for a custom animation.
- Color is never the only signal for status/priority — always paired with
  a label or icon.

## 7. What This Does Not Change

- Information architecture (sidebar, board/backlog/sprint views) and the
  MVP module scope are unaffected — this document is about visual/motion
  treatment, not what screens exist. Screen-by-screen specs land in Phase 2
  and must follow these principles.

## 8. UI First Principle (founder manifesto, 2026-07-14)

> EAGLES is not a Jira clone. It is a premium enterprise work-management
> platform. Every UI decision should prioritize: **Simplicity over
> complexity · Calm over clutter · Motion over static · Craftsmanship over
> speed · Consistency over creativity.**
>
> **Visual inspiration:** Apple · Linear · Notion · Stripe · Vercel.
>
> **Avoid:** generic admin templates · Bootstrap-looking layouts ·
> excessive colors · heavy shadows · sharp corners · busy dashboards.
>
> **Use:** premium spacing · floating surfaces · smooth 150–250ms
> animations · Framer Motion · soft neutral palette · rounded 16–24px
> components · elegant loading & empty states · pixel-perfect alignment ·
> responsive layouts.
>
> Every screen should feel expensive, modern, and intentionally designed.

The premium sign-in screen (`src/features/authentication/components/sign-in-screen.tsx`)
is the reference implementation of this bar.

## 9. Phased UI Strategy (founder decision, 2026-07-14)

To reach a functionally complete MVP faster, EAGLES is built in two UI
gears:

1. **Now → MVP-complete: "basic but systematized."** Feature screens
   (Issues, Board, Sprint, etc.) ship with clean, minimal UI built
   **exclusively from the shared component library** (`src/shared/components/ui/*`)
   and the design tokens (CSS variables in `globals.css`, Tailwind theme).
   No ad-hoc, one-off markup or hardcoded colors/spacing. Effort
   concentrates on data model, APIs, business rules, RBAC, and module
   architecture.
2. **After MVP: "design polish phase."** The premium visual system (§1–§8
   + any supplied Figma/screens) is applied **once, across all screens
   together** — which produces more consistency than polishing
   screen-by-screen.

**Why this is safe — no rework, no migration:** UI is decoupled from data
by the architecture (ADR-0001):

- The UI layer never touches the database. It calls the **API/service
  layer** (stable contract in `docs/04_API/openapi.yaml`). Schema and
  migrations are owned by the DB layer — **changing UI never triggers a
  database migration.**
- Because every basic screen is composed from shared primitives + tokens,
  the polish phase is largely *upgrading the primitives and tokens* (border
  radius, shadows, motion, palette) — and every screen inherits the change
  at once — plus targeted per-screen layout refinement against the supplied
  designs.
- Business logic, validation, and RBAC live in services/repositories and
  are covered by tests independent of the UI, so re-skinning cannot break
  them.

**The one discipline that makes this work:** basic screens MUST use the
shared component library and tokens, never bespoke markup. A screen
hand-rolled with ad-hoc divs/colors would make the later polish a rewrite
instead of a swap. This is a hard rule for the "basic" gear.

## Design system primitives (2026-08-08)

Added when the UI moved from "correct" to "considered". The visual language is
now four primitives in `src/shared/components/ui/`, not a set of class strings
people copy between features.

| Primitive | What it owns |
|---|---|
| `Card` (+ `CardHeader`, `CardContent`) | Every panel surface. `rounded-2xl`, hairline border, `shadow-card`. |
| `StatTile` | A headline number: label, value, tinted icon chip, optional delta. |
| `EmptyState` | Icon, title, one explanatory line. `compact` for inside a card. |
| `PageHeader` | Icon chip, title, subtitle, actions. |

**Why primitives and not utility classes.** `rounded-xl border border-border
bg-background` was hand-written in five feature components. That is how a design
drifts: someone softens a radius in one place and the app quietly stops matching
itself — the same failure that lost the classification chips from the Issues
list. One shape, one definition.

### Rules that come with them

1. **Elevation is three named steps** — `shadow-card`, `shadow-card-hover`,
   `shadow-pop`. Very low alpha on purpose: at this radius a heavy shadow reads
   as a 2010 drop-shadow. Depth comes from the hairline border plus a
   barely-there lift.
2. **Surfaces are softer than controls.** Cards `rounded-2xl`, buttons and
   inputs `rounded-lg`. The container should feel like paper, the control like
   a button.
3. **Tints come from semantic tokens**, never new hexes. A `StatTile` tone is
   `accent`/`success`/`warning`/`danger`/`neutral`; "a nice purple" is exactly
   how the no-ad-hoc-colour rule gets broken.
4. **Hover lift only on things that are clickable.** `Card interactive` exists
   for that; a lift on a static panel invites a click that does nothing.
5. **An empty state is a sentence, not a blank.** Icon, what the situation is,
   what will fill it. In a multi-column grid an absent card is worse than an
   empty one — it leaves a hole and shifts every card below it out of its pair.

### Canvas vs. surface (2026-08-10)

`--canvas` is the page body; `--background` is the card. They are different
colours, and that is the whole point.

The first pass shipped both as pure white, so a card was separated from the page
only by a hairline border. Every shadow step above was invisible — you cannot
elevate something above a surface it is already the same colour as — and the
result read flat next to a mockup that looked lit. The chrome (sidebar, top bar)
stays `--background`, so the tinted canvas is the content area only and the
frame reads as one continuous surface around it.

In dark mode the relationship inverts: the canvas is *darker* than the card, so
the card is still the raised thing.

### Detail routes, not in-page anchors (2026-08-10)

**A summary card links to a route. It never scrolls you to an anchor further
down the same page.** This applies to every "View all" in EAGLES from here on.

Workload's "View all people" originally scrolled to a section at the bottom of
the dashboard. Three things were wrong with it, and they generalise:

1. It looked like nothing happened — a scroll is indistinguishable from the page
   having jumped, so the affordance read as broken.
2. It required the full list to be *on* the dashboard. Seventeen people made the
   page 3.1 viewport-heights tall and pushed every chart out of reach, which is
   not how a report behaves.
3. An anchor cannot be linked to, bookmarked, or backed out of.

The pattern instead: the card shows a bounded top-N, and the complete list is a
route (`/workload/people`, `/workload/projects`) with a back link and the scope
carried in the query string. Detail routes take `?teamId=` rather than reading
client state, so a link always lands on the team the reader was looking at.

**Corollary for growth.** Truncating a card is not hiding data as long as the
full list has a home. Project balance shows five projects and states the true
total in its link; a team spanning thirty projects gets all thirty on the detail
route without the dashboard turning into the list. Bounding the summary is what
keeps the ranking readable as the org grows.

### What we are deliberately not copying from the mockups

The Workload mockup included **AI Insights** and an **"Upgrade to Pro"** upsell.
Both are omitted: there is no AI, and EAGLES is one organisation's internal tool
with no paid tiers, so a pricing upsell would be fiction. Month-over-month trend
deltas are omitted for now pending a check that they can be computed truthfully
(user `createdAt` and audit-log status replay make some of them real; figures
that depend on historical estimates do not, because `estimateMinutes` is not
versioned). Tracked as UI-3/UI-4.
