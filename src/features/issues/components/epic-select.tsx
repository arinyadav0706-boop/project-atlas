"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import type { EpicSummaryDto } from "@/features/issues/types/issue.types";

// Searchable Epic combobox (ADR-0026). Hand-rolled (no combobox lib, consistent
// with the ⌘K palette): a trigger + a filterable panel with a "No epic" option,
// keyboard navigation (↑/↓/Enter/Escape), and an empty state. Fetches the
// project's epics once, on first open.
export function EpicSelect({
  projectId,
  value,
  onChange,
  disabled,
  excludeId,
}: {
  projectId: string;
  value: string | null;
  onChange: (epicId: string | null) => void;
  disabled?: boolean;
  // Prevent choosing a specific epic as its own parent (the epic being edited).
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [epics, setEpics] = useState<EpicSummaryDto[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load epics on first open; cache for the dialog's lifetime.
  useEffect(() => {
    if (!open || epics !== null) return;
    let cancelled = false;
    apiRequest<{ epics: EpicSummaryDto[] }>(`/api/projects/${projectId}/epics`)
      .then((data) => {
        if (!cancelled) setEpics(data.epics.filter((e) => e.id !== excludeId));
      })
      .catch(() => {
        if (!cancelled) setEpics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, epics, projectId, excludeId]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const selected = useMemo(
    () => epics?.find((e) => e.id === value) ?? null,
    [epics, value],
  );

  const filtered = useMemo(() => {
    const list = epics ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) => e.title.toLowerCase().includes(q) || e.key.toLowerCase().includes(q),
    );
  }, [epics, query]);

  // Flat option list: index 0 is always "No epic", then the filtered epics.
  const options = [null, ...filtered];

  function choose(index: number) {
    const opt = options[index];
    onChange(opt ? opt.id : null);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? (
            <>
              <span className="font-mono text-xs text-muted-foreground">{selected.key}</span>{" "}
              {selected.title}
            </>
          ) : (
            "No epic"
          )}
        </span>
        <span className="flex items-center gap-1">
          {selected && !disabled && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search epics…"
              aria-label="Search epics"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.map((opt, i) => (
              <li key={opt?.id ?? "__none__"}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                    active === i ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  {opt ? (
                    <>
                      <span className="font-mono text-xs text-muted-foreground">{opt.key}</span>
                      <span className="min-w-0 flex-1 truncate">{opt.title}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No epic</span>
                  )}
                  {(opt ? opt.id === value : value === null) && (
                    <span className="text-xs text-accent">✓</span>
                  )}
                </button>
              </li>
            ))}
            {epics !== null && filtered.length === 0 && query.trim() && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                No epics match “{query.trim()}”.
              </li>
            )}
            {epics !== null && epics.length === 0 && !query.trim() && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                No epics in this project yet.
              </li>
            )}
            {epics === null && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">Loading…</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
