"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Search, Flag } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { FeatureFlagDto } from "@/features/admin/types/admin.types";

export function FeatureFlagsView({ initialFlags }: { initialFlags: FeatureFlagDto[] }) {
  const router = useRouter();
  const [flags, setFlags] = useState(initialFlags);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  // Search filtering
  const filteredFlags = useMemo(() => {
    if (!query.trim()) return flags;
    const q = query.toLowerCase().trim();
    return flags.filter(
      (f) =>
        f.key.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.owner.toLowerCase().includes(q)
    );
  }, [flags, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredFlags,
    initialPageSize: 10,
    itemLabel: "feature flags",
    resetDeps: [query],
  });

  async function mutate(key: string, body: { enabled?: boolean; reset?: boolean }) {
    setPending(key);
    try {
      const updated = await apiRequest<FeatureFlagDto>(
        `/api/admin/feature-flags/${encodeURIComponent(key)}`,
        { method: "PATCH", body },
      );
      setFlags((prev) => prev.map((f) => (f.key === key ? updated : f)));
      router.refresh();
      toast.success(body.reset ? `Reset ${key} to default` : `Updated ${key}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the flag.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-surface p-3 shadow-2xs">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feature flags by key or owner…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <span className="text-xs text-muted-foreground">
          {flags.filter((f) => f.isOverridden).length} overridden of {flags.length} total
        </span>
      </div>

      {/* Paginated Flags List */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        {filteredFlags.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No feature flags match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {paginatedItems.map((flag) => (
              <div
                key={flag.key}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                      {flag.key}
                    </code>
                    <Badge variant="default" className="text-[10px]">
                      {flag.owner}
                    </Badge>
                    {flag.isOverridden ? (
                      <span className="rounded-xs bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                        Overridden
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        Default ({flag.defaultEnabled ? "on" : "off"})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {flag.description}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {flag.isOverridden && (
                    <button
                      type="button"
                      onClick={() => mutate(flag.key, { reset: true })}
                      disabled={pending === flag.key}
                      title="Reset to default"
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <Toggle
                    checked={flag.enabled}
                    disabled={pending === flag.key}
                    onChange={(next) => mutate(flag.key, { enabled: next })}
                    label={`Toggle ${flag.key}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <DataPagination {...paginationProps} pageSizeOptions={[5, 10, 25]} />
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
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
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-150 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
