import * as React from "react";
import { cn } from "@/shared/lib/utils";

// The surface primitive. Every panel in the app is one of these.
//
// It exists because `rounded-xl border border-border bg-background` was
// hand-written in at least five feature components, which is how a design
// drifts: someone softens a radius in one place and the app quietly stops
// matching itself. The same reasoning as `issueCardSelect` for issue rows —
// one shape, one definition.

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border bg-background shadow-card",
      // Only for cards that are themselves a link or button. A hover lift on a
      // static panel invites a click that does nothing.
      interactive &&
        "transition-shadow duration-150 hover:shadow-card-hover focus-within:shadow-card-hover",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

/**
 * Card header: an optional tinted icon chip, a title, and an optional action
 * on the right (usually a "View all" link).
 *
 * The icon is a chip rather than a bare glyph because at 13px a lone icon next
 * to bold text reads as debris; a tinted rounded square gives it a reason to
 * be there and carries the section's colour.
 */
export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 px-5 pb-3 pt-4", className)}>
      {icon && <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

/**
 * Full-bleed content — rows that run edge to edge inside the card, with their
 * own internal padding and dividers. Used for lists, where an inset row would
 * make the divider stop short of the card edge and look broken.
 */
export function CardRows({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 pb-2", className)} {...props} />;
}
