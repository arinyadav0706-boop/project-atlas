import * as React from "react";
import { cn } from "@/shared/lib/utils";

// The workspace frame (04_Modernization_Audit.md §F2).
//
// Replaces `PageShell` for pages that have been migrated. Two things it does
// that PageShell did not:
//
//   1. FULL-BLEED BY DEFAULT. PageShell capped content at 1152–1280px and
//      centred it. Measured at 1920×1080 that left 168–232px of dead gutter on
//      EACH side — up to 464px of a screen the user paid for, unused. At 1440
//      the gutter is zero, which is why the problem survived review: it was
//      built at the width it looks fine at.
//
//   2. OWNS ITS HEIGHT. The workspace is a flex column with `min-h-0`, so a
//      toolbar and a table header can stay fixed while only rows scroll.
//      Before, `/issues` scrolled the whole document to 2,567px in a 1,024px
//      viewport.
//
// `measure` is the declared exception, not the default: forms and settings
// need a reading width, and 1,600px of input fields is worse than a gutter.
//
// TEMPORARY, and deliberately visible: `(app)/layout.tsx` still puts `px-8
// py-7` on <main> for the 31 pages that have not migrated. A migrated page
// cancels it with negative margins. That inversion — padding owned by the page
// rather than the shell — is what the global flip does after the /issues gate,
// at which point `bleed` here becomes a no-op and is deleted.

const SHELL_PADDING_CANCEL = "-mx-8 -my-7";

const MEASURES = {
  /** Data surfaces: tables, boards, dashboards. Everything the audit measured. */
  full: "w-full",
  /** Prose and forms: settings, profile, configuration. */
  regular: "mx-auto w-full max-w-4xl",
} as const;

export function AppFrame({
  measure = "full",
  className,
  children,
}: {
  measure?: keyof typeof MEASURES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        SHELL_PADDING_CANCEL,
        // The frame is the scroll container's child and must fill it, so the
        // workspace below can claim the remaining height rather than growing
        // the document.
        //
        // `100% + 3.5rem`, not `100%`: `h-full` measures the CONTENT box, which
        // `py-7` has already shortened by 28px top and bottom. Cancelling the
        // padding with a negative margin without giving those 56px back left a
        // dead strip under the pagination bar — measured, not theorised. The
        // calc disappears with the padding at the global flip.
        "flex h-[calc(100%+3.5rem)] min-h-0 flex-col",
        className,
      )}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", MEASURES[measure])}>{children}</div>
    </div>
  );
}

/**
 * The page's identity line: breadcrumb, title, actions. 44px, one row.
 *
 * The old `PageHeader` stacked a 26px title over a subtitle and cost ~92px
 * before tabs. On the project board that contributed to 239px of chrome — 22%
 * of a 1080px viewport spent before the first card. The subtitle is not
 * deleted, it moves: `description` renders as a title tooltip, so the sentence
 * that says what a page's numbers mean is still one hover away.
 */
export function WorkspaceHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center gap-3 border-b border-border px-4",
        className,
      )}
    >
      {breadcrumb && (
        <div className="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
          {breadcrumb}
        </div>
      )}
      <h1 className="min-w-0 truncate text-page-title text-foreground" title={description}>
        {title}
      </h1>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/**
 * The control strip under the header: search, filters, view switcher, actions.
 *
 * A real element rather than an ad-hoc flex row, because the audit found filter
 * bars hand-rolled per page and wrapping to two lines at 1280px. Fixed height
 * so the workspace below it can be computed rather than guessed.
 */
export function Toolbar({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  /** Right-aligned: counts, pagination, density — things that are not filters. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-toolbar shrink-0 items-center gap-2 border-b border-border bg-surface-sunken px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">{children}</div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2 pl-2">{trailing}</div>
      )}
    </div>
  );
}

/**
 * The scrolling region. Everything above it is fixed; only this moves.
 *
 * This is the piece that removes document-level scrolling, and with it the
 * "content pushed downward" complaint: the header and toolbar cannot be
 * scrolled away because they are not in the scroller.
 */
export const Workspace = React.forwardRef<
  HTMLDivElement,
  { className?: string; children: React.ReactNode }
>(function Workspace({ className, children }, ref) {
  // Forwards a ref so a page can scroll it back to the top — turning a page in
  // a table and landing halfway down the new rows is disorienting, and the
  // document is no longer the scroller, so `window.scrollTo` cannot do it.
  return (
    <div ref={ref} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      {children}
    </div>
  );
});
