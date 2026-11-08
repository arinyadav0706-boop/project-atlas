import React from "react";
import { cn } from "@/shared/lib/utils";

/**
 * AppFrame — The primary full-bleed layout container for EAGLES.
 * 
 * Replaces the fragmented and centered PageShell constraints that previously
 * caused 168px-232px dead gutters on 1080p+ screens.
 * 
 * Defaults to full-bleed width with standardized responsive edge padding.
 */
export interface AppFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * Layout width preset:
   * - "full": Fills 100% of workspace width (default for boards, tables, backlogs, workload)
   * - "reading": Constrained to max-w-4xl for text/profile/settings surfaces
   * - "compact": Constrained to max-w-6xl for small form wizards
   */
  measure?: "full" | "reading" | "compact";
  /** Optional tight mode to strip vertical padding for full-height virtualized tables or boards */
  flush?: boolean;
}

export function AppFrame({
  children,
  measure = "full",
  flush = false,
  className,
  ...props
}: AppFrameProps) {
  return (
    <div
      className={cn(
        "w-full flex-1",
        measure === "reading" && "max-w-4xl mx-auto",
        measure === "compact" && "max-w-6xl mx-auto",
        measure === "full" && "max-w-full",
        !flush ? "px-4 py-3 md:px-6 md:py-4" : "p-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
