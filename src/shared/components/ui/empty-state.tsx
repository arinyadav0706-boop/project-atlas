import * as React from "react";
import { cn } from "@/shared/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2.5 py-8" : "gap-3.5 py-14",
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary/12 to-google-purple/12 text-primary ring-1 ring-primary/15",
            compact ? "h-11 w-11 [&>svg]:h-5 [&>svg]:w-5" : "h-14 w-14 [&>svg]:h-7 [&>svg]:w-7",
          )}
        >
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
