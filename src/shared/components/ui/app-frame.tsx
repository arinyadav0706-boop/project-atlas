import React from "react";
import { cn } from "@/shared/lib/utils";

export interface AppFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  measure?: "full" | "reading" | "compact";
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
        !flush ? "px-5 py-5 md:px-8 md:py-6" : "p-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
