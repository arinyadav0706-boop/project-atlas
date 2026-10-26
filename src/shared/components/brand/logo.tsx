import { cn } from "@/shared/lib/utils";

// The EAGLES app mark: a spread-winged eagle in the ink colour, from the
// approved Home reference. One flat path in `currentColor`, so it stays a
// server component with zero client JS and follows the theme's foreground.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      className={cn("shrink-0 text-foreground", className)}
      role="img"
      aria-label="EAGLES"
    >
      <path
        fill="currentColor"
        d="M13.5 8L14.5 5.5L16 3.5L18 4.3L19.8 5.6L17.8 6.1L18.5 8Q24 7 31.5 2.5L27.5 8L29.5 8.5L25.5 11L27.5 11.5L23.5 13.5L25 14.5L20 15L18.5 14L18 18L19 22L16 20.5L13 22L14 18L13.5 14L12 15L7 14.5L8.5 13.5L4.5 11.5L6.5 11L2.5 8.5L4.5 8L0.5 2.5Q8 7 13.5 8Z"
      />
    </svg>
  );
}
