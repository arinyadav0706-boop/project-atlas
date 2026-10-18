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
        "flex flex-wrap items-center justify-between gap-4",
        !compact ? "pb-6" : "pb-3",
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-google-purple/15 text-primary shadow-2xs ring-1 ring-primary/15 [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1
            className={cn(
              "font-bold tracking-tight text-foreground leading-tight",
              compact ? "text-lg md:text-xl" : "text-xl md:text-2xl"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}
