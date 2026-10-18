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
        "flex h-10 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 text-sm text-foreground",
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
    <div className={cn("flex items-center gap-1.5", className)} {...props}>
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
      className={cn("mx-1 h-4 w-px bg-border", className)}
      {...props}
    />
  );
}
