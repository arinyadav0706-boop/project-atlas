import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's built-in scale. Our type tokens
// (tailwind.config.ts → fontSize) are spelled `text-meta`, `text-body`…, which
// it would otherwise read as COLOURS — so `cn("text-meta", "text-muted-foreground")`
// silently dropped the size and the text rendered at the inherited 16px.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["page-title", "section", "body", "label", "meta", "micro"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
