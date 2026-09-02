// Pagination arithmetic, kept out of the component.
//
// Not merely tidiness: `pagination.tsx` is a "use client" module, and a Server
// Component that imports a value from one gets a client-reference proxy rather
// than the value. `PAGE_SIZE_OPTIONS.includes(...)` in `issues/page.tsx` threw
// `includes is not a function` at request time — a 500 that typecheck, lint and
// build all pass. Plain modules are importable from both sides; client modules
// are not.

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * Page numbers to render, with `null` standing for an ellipsis.
 *
 * Always shows the first page, the last page, and a window around the current
 * one, so the control's width does not change as you move through 146 pages.
 */
export function pageWindow(page: number, pageCount: number, span = 1): (number | null)[] {
  if (pageCount <= 1) return [1];
  // Below the width the window would occupy anyway, list every page: an
  // ellipsis that hides one page is pure loss.
  if (pageCount <= 2 * span + 5) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const wanted = new Set<number>([1, pageCount, page]);
  for (let i = 1; i <= span; i++) {
    if (page - i > 1) wanted.add(page - i);
    if (page + i < pageCount) wanted.add(page + i);
  }
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const n of sorted) {
    // A gap of exactly one is filled rather than elided: "1 … 3" is longer to
    // read than "1 2 3" and hides a page for no gain.
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push(null);
    out.push(n);
    previous = n;
  }
  return out;
}
