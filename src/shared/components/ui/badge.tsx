import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted/90 text-muted-foreground border border-border/50",
        accent: "bg-primary/12 text-primary border border-primary/20",
        primary: "bg-primary/12 text-primary border border-primary/20",
        outline: "border border-border/80 text-muted-foreground bg-surface/60",
        success:
          "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
        warning:
          "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/20",
        destructive:
          "bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/20",
        info:
          "bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/20",
        purple:
          "bg-purple-500/12 text-purple-700 dark:text-purple-300 border border-purple-500/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            variant === "success" && "bg-emerald-500",
            variant === "warning" && "bg-amber-500",
            variant === "destructive" && "bg-rose-500",
            variant === "info" && "bg-sky-500",
            variant === "purple" && "bg-purple-500",
            (!variant || variant === "default") && "bg-muted-foreground",
            (variant === "accent" || variant === "primary") && "bg-primary"
          )}
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
