import * as React from "react";
import { cn } from "@/shared/lib/utils";

// The outer wrapper every page uses, so page width is decided once.
//
// Before this, each page picked its own: Home `max-w-6xl`, Workload
// `max-w-7xl`, Admin and the project shell `max-w-5xl`, Projects nothing at
// all. Navigating between them shifted the content column sideways, which is a
// large part of why the app read as several designs stitched together — the
// frame moved even when the styling matched.
//
// Two widths, chosen by what the page holds:
//
//   "wide"    dense, multi-column data — dashboards, boards, tables.
//   "regular" everything else. Prose and forms need a measure, not a monitor.
//
// There is deliberately no third option. A page that "needs" one is a page
// disagreeing with its own content type.
const WIDTHS = {
  wide: "max-w-7xl",
  regular: "max-w-6xl",
} as const;

export function PageShell({
  width = "regular",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto", WIDTHS[width], className)}>{children}</div>;
}
