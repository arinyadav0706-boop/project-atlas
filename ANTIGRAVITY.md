# ANTIGRAVITY.md — UI/UX Engineering Charter & Scope of Work

> **Role:** Principal Design Engineer & Presentation Layer Architect  
> **Project:** EAGLES (Project Atlas)  
> **Aesthetic Mandate:** Modern Enterprise Workflow Management System designed as if **Google and Apple collaborated**.  
> **Guiding Principle:** **Strict Presentation-Layer Masking.** Never touch backend core functionality, databases, services, or APIs.

---

## 1. Executive Mandate

Antigravity is responsible for the complete UI/UX modernization of **EAGLES** (*Enterprise Agile Governance, Lifecycle & Execution System*). 

The goal is to elevate EAGLES from a functional MVP scaffold into a world-class enterprise work-management platform combining:
* **Google's Enterprise Power & Density:** High-throughput information architecture, dense data grids (32px rows), full-bleed responsive layouts, search-centric navigation, and contextual slide-over drawers (Google Cloud Console / Google Workspace).
* **Apple's Restraint & Craftsmanship:** Flawless visual hierarchy, fluid physics-based transitions (150–250ms ease-out springs via Framer Motion), subtle tonal elevation, crisp typography (SF Pro / Inter), and non-destructive tactile interactions.

---

## 2. Non-Negotiable Boundaries (The Strict Firewall)

To ensure zero regressions to the data layer, security, and business logic, Antigravity operates under an ironclad boundary:

### 🚫 What Antigravity MUST NEVER Touch (Forbidden Territory)
1. **No Database & ORM Changes:** Never modify `prisma/schema.prisma`, never run migrations, and never touch `src/shared/lib/db.ts`.
2. **No Backend Services:** Never alter business logic, calculations, or workflows in `src/features/*/services/`.
3. **No Repositories:** Never touch `src/features/*/repositories/` or direct database queries.
4. **No RBAC / Authorization Alterations:** Never bypass or rewrite permission models in `src/features/authorization/` or service-layer role checks.
5. **No API Contract Changes:** Never alter Route Handlers (`src/app/api/...`), HTTP response structures, or DTO contracts. The UI must adapt to existing contracts.
6. **No Algorithmic / Domain Logic Drift:** Never modify LexoRank math (`fractional-indexing`), OCC concurrency logic (`version: Int`), or metric definitions (`docs/12_Metrics/`).

### ✅ What Antigravity Exclusively Owns (Presentation Layer)
1. **Design System & Tokens:** `src/app/globals.css`, `tailwind.config.ts`, CSS custom variables, typography scales, elevation shadows, and color palettes.
2. **Global App Shell:** `src/app/(app)/layout.tsx`, `src/shared/components/app-shell/` (`top-bar.tsx`, `sidebar.tsx`, navigation rails).
3. **Shared UI Primitives:** `src/shared/components/ui/` (`DataTable`, `AppFrame`, `Toolbar`, `Drawer`, `SplitView`, `PageHeader`, `Card`, `Badge`, `Button`, etc.).
4. **Feature UI Components:** `src/features/*/components/` — purely presentation, visual layout, interactive states, animations, and micro-interactions.
5. **Responsiveness & Viewport Optimization:** Eradication of dead gutters at 1080p/1440p/4K, full-bleed data containers, and density controls (Comfortable vs. Compact).

---

## 3. The Design Vision: "Google & Apple in Collaboration"

| Dimension | **Google Enterprise Influence** | **Apple Human Interface Influence** | **EAGLES Synthesis** |
| :--- | :--- | :--- | :--- |
| **App Shell & Layout** | Slim 48px header, prominent `⌘K` omnibox, collapsible 240px→48px rail. | Translucent blurs, balanced icon weights, zero visual clutter. | **Google-speed shell** with Apple-grade tactile finish. |
| **Viewport & Canvas** | Full-bleed responsive width (`calc(100vw - sidebarWidth)`), no boxed containers. | Refined internal padding, harmonious alignment. | **Zero dead gutters** at 1920×1080. Data stretches intelligently. |
| **Surfaces & Cards** | Material 3 tonal elevation (`surface-container`), hairline 1px borders (`#DADCE0`). | Soft corners (6px–8px, no chunky 20px bubbles), subtle ambient contact shadows. | **Flat, layered clarity** without card-in-card nesting. |
| **Data Tables & Lists** | Dense 32px rows, sticky headers, column resizing, virtual scrolling for 5,000+ items. | Crisp typography, smooth hover states, tactile row selection. | **High-density TanStack DataTable** with comfortable/compact toggle. |
| **Contextual Detail** | Slide-over inspector panel (Google Cloud Console inspect drawer). | Fluid spring transitions, sheet-like drag and dismiss. | **Drawer / SplitView** replacing disruptive full-page jumps and modals. |
| **Color & Visual Tone** | Purposeful status semantics (Google Blue, Emerald, Amber, Crimson). | Restrained light-first palette (`#FAFAFA` canvas, dark neutral `#1D1D1F` text). | **Authoritative enterprise calm**; color only for meaning. |

---

## 4. Key UI/UX Problems Being Resolved

Antigravity directly targets the measured failures identified in `docs/05_UI/04_Modernization_Audit.md`:

1. **Fixing the 336px–464px Dead Gutter (A1):**
   * *Problem:* Content was capped at 1152px–1280px on 1080p monitors, wasting over 30% of the screen.
   * *Fix:* Full-bleed `<AppFrame>` default with flexible column widths.
2. **Eliminating Horizontal Page Shifts (A2):**
   * *Problem:* Jumping 64px sideways between `/home` and `/issues`.
   * *Fix:* Unified root viewport shell wrapping all app routes consistently.
3. **Reclaiming the 239px Vertical Chrome (A3):**
   * *Problem:* 22% of screen height lost to headers and padding before the board begins.
   * *Fix:* Collapsing top bar (56px → 48px), unifying breadcrumbs into the page header (44px), reducing total chrome from 239px to ~130px.
4. **Eradicating Card-in-Card Nesting (A4):**
   * *Problem:* Lists wrapped inside cards inside panels (e.g. 10 items taking 630px).
   * *Fix:* Clean, borderless list rows with 1px subtle divider lines taking only ~320px.
5. **Systematizing the Radius & Spacing Scales (A5):**
   * *Problem:* 6 radii (up to 20px), 9 rhythms, 18 paddings, 9 font sizes.
   * *Fix:* Strict 3-radius scale (4px, 6px, 8px), standard 4px base spacing, and accessible 6-tier typography scale (min 11px).

---

## 5. UI Transformation Roadmap

* **Phase 1 — Design Tokens & Core Primitives:**
  * Update `src/app/globals.css` and `tailwind.config.ts` with Google/Apple tonal variables.
  * Standardize border-radius to `--radius-sm (4px)`, `--radius-md (6px)`, `--radius-lg (8px)`.
  * Build `<AppFrame>`, `<Toolbar>`, `<DataTable>`, and `<Drawer>` in `src/shared/components/ui/`.
* **Phase 2 — Unified Shell Modernization:**
  * Transform `Sidebar` into a collapsible Google/Apple rail (240px expanded / 48px collapsed).
  * Refine `TopBar` into a sleek 48px command center with global search integration.
* **Phase 3 — High-Density Workspaces:**
  * Modernize `/issues` with virtualized full-bleed `DataTable` and inspect drawer.
  * Modernize `/projects/[id]/board` with full-height Kanban columns, compact cards, and sticky controls.
  * Modernize `/projects/[id]/backlog` with unified sprint drag sections.
* **Phase 4 — Dashboards, Workload & Overview:**
  * Flatten `/home` into a high-density, multi-column dashboard without card nesting.
  * Refine `/workload` into an executive time-phased grid with clear capacity indicators.
  * Modernize `/dashboards` and `/admin` settings with consistent Google Cloud-style layouts.

---

## 6. Verification & Safety Protocol

Before pushing any presentation layer changes, Antigravity mandates:
1. `npm run typecheck` — Strict TypeScript with zero errors.
2. `npm run lint` — Linting passed with no forbidden utility classes.
3. `npm test` & `npm run test:integration` — All 1,500+ unit and integration tests must remain 100% green.
4. Multi-viewport browser visual check at **1920×1080**, **1440×900**, and **1280×800** in both Light and Dark modes.
