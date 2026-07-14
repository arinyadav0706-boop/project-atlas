import { cn } from "@/shared/lib/utils";

// The EAGLES app mark: an accent tile with an abstract upward "wing/peak"
// suggesting lift and execution. Solid fill (no gradient id) so it stays a
// server component with zero client JS and never collides when rendered
// more than once on a page.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="EAGLES"
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path d="M16 8L25 23L16 18.5L7 23Z" fill="white" />
    </svg>
  );
}
