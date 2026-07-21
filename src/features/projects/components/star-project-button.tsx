"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";

// Toggles a project pin (Favorites, ADR-0012). Optimistic; reverts on failure.
export function StarProjectButton({
  projectId,
  initialStarred,
}: {
  projectId: string;
  initialStarred: boolean;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !starred;
    setStarred(next);
    setPending(true);
    try {
      await apiRequest(`/api/projects/${projectId}/star`, {
        method: next ? "POST" : "DELETE",
      });
    } catch (error) {
      setStarred(!next); // revert
      toast.error(error instanceof Error ? error.message : "Couldn't update the star.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={starred}
      aria-label={starred ? "Unstar project" : "Star project"}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Star className={cn("h-5 w-5", starred && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
