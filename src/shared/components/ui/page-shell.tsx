import * as React from "react";
import { cn } from "@/shared/lib/utils";

// Full-bleed responsive container for pages using PageShell
// Eliminates the 168-232px dead gutters measured in 04_Modernization_Audit.md
const WIDTHS = {
  wide: "w-full max-w-full",
  regular: "w-full max-w-full",
  reading: "max-w-5xl mx-auto",
} as const;

export function PageShell({
  width = "wide",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-full transition-all duration-150", WIDTHS[width], className)}>
      {children}
    </div>
  );
}
