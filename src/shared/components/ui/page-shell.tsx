import * as React from "react";
import { cn } from "@/shared/lib/utils";

const WIDTHS = {
  wide: "w-full max-w-full px-5 py-5 md:px-8 md:py-6",
  regular: "w-full max-w-full px-5 py-5 md:px-8 md:py-6",
  reading: "max-w-5xl mx-auto px-5 py-5 md:px-8 md:py-6",
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
