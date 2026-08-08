import * as React from "react";
import { cn } from "@/shared/lib/utils";

// The "nothing here" state, as one component so every surface says it the same
// way. Three parts, in a fixed order: a soft icon, a short title that states
// the situation, and one line explaining what will fill it.
//
// The icon sits in a tinted rounded square at low opacity rather than being a
// large grey glyph — an oversized outline icon reads as a broken image, which
// is the opposite of the reassurance an empty state is for.
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
  /** For empty states inside a small card, where the full version would dominate. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-8" : "gap-3 py-14",
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-accent/[0.07] text-accent/70",
            compact ? "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" : "h-14 w-14 [&>svg]:h-7 [&>svg]:w-7",
          )}
        >
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
