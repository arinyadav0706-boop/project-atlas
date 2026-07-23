"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import type { FeatureFlagDto } from "@/features/admin/types/admin.types";

export function FeatureFlagsView({ initialFlags }: { initialFlags: FeatureFlagDto[] }) {
  const router = useRouter();
  const [flags, setFlags] = useState(initialFlags);
  const [pending, setPending] = useState<string | null>(null);

  async function mutate(key: string, body: { enabled?: boolean; reset?: boolean }) {
    setPending(key);
    try {
      const updated = await apiRequest<FeatureFlagDto>(
        `/api/admin/feature-flags/${encodeURIComponent(key)}`,
        { method: "PATCH", body },
      );
      setFlags((prev) => prev.map((f) => (f.key === key ? updated : f)));
      // Revalidate server data so other views (audit log) and the router cache
      // reflect the change on navigation.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the flag.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Toggle capabilities for this organization without a deploy. Flags gate
        behavior only — never permissions or data access.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {flags.map((flag) => (
          <li key={flag.key} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-medium text-foreground">{flag.key}</code>
                <Badge variant="default" className="text-[10px]">
                  {flag.owner}
                </Badge>
                {flag.isOverridden ? (
                  <Badge variant="outline" className="text-[10px]">
                    Overridden
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Default ({flag.defaultEnabled ? "on" : "off"})
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{flag.description}</p>
            </div>

            {flag.isOverridden && (
              <button
                type="button"
                onClick={() => mutate(flag.key, { reset: true })}
                disabled={pending === flag.key}
                title="Reset to default"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            <Toggle
              checked={flag.enabled}
              disabled={pending === flag.key}
              onChange={(next) => mutate(flag.key, { enabled: next })}
              label={`Toggle ${flag.key}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Minimal accessible switch (no shadcn switch in the kit yet).
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
        checked ? "bg-accent" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
