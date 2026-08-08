import * as React from "react";
import { cn } from "@/shared/lib/utils";

// The top of a page: an optional icon chip, a title, one line of context, and
// controls on the right.
//
// The subtitle is not decoration — it is where a page says what its numbers
// actually mean ("Unfinished work queued against each person"), which is the
// difference between a dashboard someone trusts and one they guess at.
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-4", className)}>
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
