import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground border border-transparent",
        accent: "bg-primary/10 text-primary border border-primary/20",
        primary: "bg-primary/10 text-primary border border-primary/20",
        outline: "border border-border text-muted-foreground bg-transparent",
        success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
        destructive: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20",
        info: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20",
        purple: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20",
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
