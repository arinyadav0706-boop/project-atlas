import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  inputSize?: "sm" | "default" | "lg";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputSize = "default", ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-border/80 bg-surface text-foreground shadow-2xs transition-all duration-200",
        "placeholder:text-muted-foreground/65",
        "hover:border-border-strong",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        inputSize === "sm" && "h-8 px-3 text-xs",
        inputSize === "default" && "h-9 px-3.5 text-[13px]",
        inputSize === "lg" && "h-10 px-4 text-sm",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
