import { describe, expect, it } from "vitest";
import { pageWindow } from "@/shared/lib/pagination";

// `pageWindow` decides which page numbers a 146-page control shows. The bugs it
// can have are all off-by-one and all invisible until someone is on page 2 of 3.

describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first and last page reachable from the middle", () => {
    expect(pageWindow(73, 146)).toEqual([1, null, 72, 73, 74, null, 146]);
  });

  it("elides only gaps wider than one page", () => {
    // 1 … 3 would be longer to read than 1 2 3 and would hide a page for
    // nothing, so a single-page gap is filled instead.
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
  });

  it("does not repeat the first or last page when the window reaches them", () => {
    expect(pageWindow(1, 146)).toEqual([1, 2, null, 146]);
    expect(pageWindow(146, 146)).toEqual([1, null, 145, 146]);
    expect(pageWindow(2, 146)).toEqual([1, 2, 3, null, 146]);
  });

  it("never emits a page outside the range", () => {
    for (let count = 1; count <= 12; count++) {
      for (let page = 1; page <= count; page++) {
        const shown = pageWindow(page, count).filter((n): n is number => n !== null);
        expect(Math.min(...shown)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...shown)).toBeLessThanOrEqual(count);
        // Ascending, no duplicates — the two ways a naive builder breaks.
        expect([...shown]).toEqual([...new Set(shown)].sort((a, b) => a - b));
        expect(shown).toContain(page);
      }
    }
  });

  it("widens with span", () => {
    expect(pageWindow(50, 146, 2)).toEqual([1, null, 48, 49, 50, 51, 52, null, 146]);
  });
});
