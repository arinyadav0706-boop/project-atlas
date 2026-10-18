import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm hover:shadow-glow hover:brightness-105",
        primary:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm hover:shadow-glow hover:brightness-105",
        accent:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm hover:shadow-glow hover:brightness-105",
        outline:
          "border border-border/80 bg-surface text-foreground shadow-2xs hover:bg-muted/60 hover:border-border-strong",
        ghost:
          "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        secondary:
          "bg-muted/80 text-foreground hover:bg-muted",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground shadow-sm hover:brightness-105",
        "destructive-outline":
          "border border-destructive/30 bg-surface text-destructive shadow-2xs hover:bg-destructive/10",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3.5 text-xs",
        xs: "h-7 px-2.5 text-[11px] rounded-lg",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
