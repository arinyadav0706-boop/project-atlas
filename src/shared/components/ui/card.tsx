import * as React from "react";
import { cn } from "@/shared/lib/utils";

// EAGLES Card Primitive — Google × Apple Material Surface
// Full specification: ANTIGRAVITY.md
// Clean 8px radius, subtle 1px border, tonal surface background.

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; flush?: boolean }
>(({ className, interactive = false, flush = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border bg-surface shadow-card transition-all duration-150",
      flush && "overflow-hidden p-0",
      interactive &&
        "hover:border-border-strong hover:shadow-card-hover focus-within:ring-2 focus-within:ring-primary/20",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

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
    <div className={cn("flex items-center gap-2.5 border-b border-border-subtle px-4 py-3", className)}>
      {icon && <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardRows({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("divide-y divide-border-subtle", className)} {...props} />;
}
