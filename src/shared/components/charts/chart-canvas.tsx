"use client";

import { useEffect, useRef, useState } from "react";
import { echarts, type EChartsOption } from "./echarts-core";
import { resolveChartTheme, type ChartTheme } from "./chart-theme";

// The one ECharts React wrapper (ADR-0036 rule 2). Loaded only through
// `chart.tsx`, which wraps it in next/dynamic({ ssr: false }) — ECharts needs a
// real DOM node and a canvas, neither of which exist during SSR.

export interface ChartCanvasProps {
  /** Builds the option from the live theme, so colours follow a theme swap. */
  buildOption: (theme: ChartTheme) => EChartsOption;
  height: number;
  /** Read by screen readers; canvas exposes no DOM of its own. */
  summary: string;
  className?: string;
}

export default function ChartCanvas({
  buildOption,
  height,
  summary,
  className,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  // Bumped when the document's theme class changes, to re-resolve colours.
  const [themeEpoch, setThemeEpoch] = useState(0);

  // Dark mode is a `dark` class on <html> (tailwind darkMode: "class"), so the
  // CSS variables change without any React state changing. Without this the
  // canvas would keep the colours it was born with.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeEpoch((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = instanceRef.current ?? echarts.init(container, undefined, { renderer: "canvas" });
    instanceRef.current = chart;

    const theme = resolveChartTheme(container);
    chart.setOption(
      {
        // Canvas produces no DOM, so this is the entire accessible
        // representation unless we also render a text summary (we do).
        aria: { enabled: true, decal: { show: false } },
        ...buildOption(theme),
      },
      // Replace rather than merge: a shorter series must not leave stale points
      // from the previous option behind.
      { notMerge: true },
    );

    // Charts live in flexible layouts; without this they keep their birth size.
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [buildOption, themeEpoch]);

  // Dispose only on unmount — a re-render must reuse the instance, or every
  // update leaks a canvas.
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return (
    <figure className={className}>
      <div ref={containerRef} style={{ height }} role="img" aria-label={summary} />
      {/* Belt and braces: ECharts' generated description is not always read. */}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
