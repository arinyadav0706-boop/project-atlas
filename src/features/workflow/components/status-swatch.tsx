import { cn } from "@/shared/lib/utils";

// One dot, one definition of what a status colour looks like (30_workflow BR-1).
//
// Colours are stored as TOKEN NAMES, never hex, so both themes keep working —
// which means the mapping from token to class has to live somewhere, and having
// it in one component beats eight components agreeing by accident. Tailwind
// also cannot see a class built by string concatenation, so the map has to be
// written out in full for the classes to survive the build.

const SWATCH: Record<string, string> = {
  slate: "bg-slate-400",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
};

/** The Tailwind class for a status colour token, for callers that need it raw. */
export function statusColorClass(color: string): string {
  return SWATCH[color] ?? SWATCH.slate!;
}

export function StatusSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", statusColorClass(color), className)}
      aria-hidden
    />
  );
}
