import * as React from "react";
import { cn } from "@/shared/lib/utils";

// EAGLES Card Primitive — Spatial Squircle Surface with Soft Ambient Elevation

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; flush?: boolean }
>(({ className, interactive = false, flush = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border/60 bg-surface shadow-card transition-all duration-200",
      flush ? "overflow-hidden p-0" : "p-5",
      interactive &&
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover focus-within:ring-4 focus-within:ring-primary/15",
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
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border-subtle/80 px-5 py-4",
        className
      )}
    >
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      )}
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardRows({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("divide-y divide-border-subtle/80", className)} {...props} />;
}
