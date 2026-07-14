"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// Light/dark toggle. Light is the default; the choice persists to
// localStorage and is applied pre-paint by the inline script in the root
// layout to avoid a flash of the wrong theme.
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function set(dark: boolean) {
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        aria-label="Light theme"
        aria-pressed={!isDark}
        onClick={() => set(false)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          !isDark ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={isDark}
        onClick={() => set(true)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          isDark ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
