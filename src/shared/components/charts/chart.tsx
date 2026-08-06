"use client";

import dynamic from "next/dynamic";
import type { ChartCanvasProps } from "./chart-canvas";

// ECharts touches `window`, `document` and a canvas context, none of which
// exist during SSR (ADR-0036 rule 2). Loading the canvas component with
// ssr:false is what keeps the server render — and hydration — clean.
//
// Every chart in EAGLES mounts through this component.
const ChartCanvas = dynamic(() => import("./chart-canvas"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-muted"
      style={{ height }}
      aria-hidden
    />
  );
}

export function Chart(props: ChartCanvasProps) {
  return <ChartCanvas {...props} />;
}

// Distinct from a genuine zero: "no data" is a sentence, not an empty chart
// (docs/05_UI/03_Data_Visualisation.md rule 6).
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}
