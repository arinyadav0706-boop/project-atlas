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
