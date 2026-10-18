"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Toolbar({ children, className, ...props }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex h-12 w-full shrink-0 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface px-4 text-sm text-foreground shadow-2xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

export function ToolbarSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-1.5 h-4 w-px bg-border/70", className)}
      {...props}
    />
  );
}
