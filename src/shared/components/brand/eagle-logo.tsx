import { cn } from "@/shared/lib/utils";

// Spread-wing eagle emblem. Two mirrored wing blades sweep UP and outward
// from the shoulders to raised tips (majestic, not drooping), with a
// single feather step on the trailing edge, above a round head + beak and
// a tapered tail. Single accent fill → zero-JS server component.
export function EagleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0 text-accent", className)}
      role="img"
      aria-label="EAGLES"
    >
      <g fill="currentColor">
        {/* right wing — upswept */}
        <path d="M32 33 C 40 26 50 21 61 19 C 54 23 47 27 42 32 C 48 30 54 31 59 34 C 51 34 44 36 38 40 C 35 38 33 36 32 33 Z" />
        {/* left wing — mirror */}
        <path d="M32 33 C 24 26 14 21 3 19 C 10 23 17 27 22 32 C 16 30 10 31 5 34 C 13 34 20 36 26 40 C 29 38 31 36 32 33 Z" />
        {/* tail / body */}
        <path d="M32 30 C 34 30 35 36 34 44 C 33.4 48 32 52 32 52 C 32 52 30.6 48 30 44 C 29 36 30 30 32 30 Z" />
        {/* head */}
        <circle cx="32" cy="23" r="4.6" />
        {/* beak */}
        <path d="M29.6 26 L 34.4 26 L 32 30.5 Z" />
      </g>
    </svg>
  );
}
