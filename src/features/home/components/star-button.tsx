"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";

// Optimistic star toggle for the Home project strip. Stops propagation so
// clicking the star never triggers the enclosing project link.
export function StarButton({
  projectId,
  initialStarred,
}: {
  projectId: string;
  initialStarred: boolean;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [busy, setBusy] = useState(false);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const next = !starred;
    setStarred(next);
    setBusy(true);
    try {
      await apiRequest(`/api/projects/${projectId}/star`, {
        method: next ? "POST" : "DELETE",
      });
    } catch (error) {
      setStarred(!next); // revert
      toast.error(error instanceof Error ? error.message : "Couldn't update star.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={starred ? "Unstar project" : "Star project"}
      className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Star
        className={cn(
          "h-4 w-4 transition-colors",
          starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
