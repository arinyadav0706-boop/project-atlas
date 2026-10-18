import * as React from "react";
import { cn } from "@/shared/lib/utils";

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  compact = false,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        !compact ? "pb-4" : "pb-2",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1
            className={cn(
              "font-semibold tracking-tight text-foreground leading-none",
              compact ? "text-base" : "text-lg md:text-xl"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
