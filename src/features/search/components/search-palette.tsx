"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, FolderKanban, CircleDot } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import type { SearchResponseDto } from "@/features/search/types/search.types";

// Global command palette (12_search.md, ADR-0021 §4). Hand-rolled — no palette
// dependency. Opened with ⌘K / Ctrl-K or the top-bar trigger; debounced query;
// results grouped Issues / Projects; arrow-key + Enter navigation.
const DEBOUNCE_MS = 180;
const EMPTY: SearchResponseDto = { issues: [], projects: [] };

// A flat, ordered list of the currently-shown results so ↑/↓ can walk across
// both groups. Each row knows where Enter should navigate.
type Row =
  | { kind: "issue"; id: string; href: string; primary: string; secondary: string }
  | { kind: "project"; id: string; href: string; primary: string; secondary: string };

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponseDto>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a slow response overwriting a newer one (last-write-wins).
  const seq = useRef(0);

  // ⌘K / Ctrl-K toggles the palette from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset transient state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setActive(0);
    } else {
      // Focus after the dialog paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced fetch. A query shorter than 2 chars clears results without a
  // round-trip (matches the service's BR-5 short-circuit).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<SearchResponseDto>(
          `/api/search?q=${encodeURIComponent(q)}`,
        );
        if (mine === seq.current) {
          setResults(data);
          setActive(0);
        }
      } catch {
        if (mine === seq.current) setResults(EMPTY);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const issueRows: Row[] = results.issues.map((i) => ({
      kind: "issue",
      id: i.id,
      href: i.href,
      primary: i.title,
      secondary: i.key,
    }));
    const projectRows: Row[] = results.projects.map((p) => ({
      kind: "project",
      id: p.id,
      href: p.href,
      primary: p.name,
      secondary: p.key,
    }));
    return [...issueRows, ...projectRows];
  }, [results]);

  const go = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      setOpen(false);
      router.push(row.href);
    },
    [router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(rows[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const hasQuery = query.trim().length >= 2;
  const issueStart = 0;
  const projectStart = results.issues.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] font-normal sm:inline-block">
          ⌘K
        </kbd>
      </button>
      {open && (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search issues and projects…"
            aria-label="Search issues and projects"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {!hasQuery && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          )}
          {hasQuery && !loading && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for “{query.trim()}”.
            </p>
          )}

          {results.issues.length > 0 && (
            <Group label="Issues">
              {results.issues.map((i, idx) => (
                <ResultRow
                  key={i.id}
                  icon={<CircleDot className="h-4 w-4 text-muted-foreground" />}
                  primary={i.title}
                  secondary={i.key}
                  isActive={active === issueStart + idx}
                  onMouseEnter={() => setActive(issueStart + idx)}
                  onClick={() => go(rows[issueStart + idx])}
                />
              ))}
            </Group>
          )}

          {results.projects.length > 0 && (
            <Group label="Projects">
              {results.projects.map((p, idx) => (
                <ResultRow
                  key={p.id}
                  icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
                  primary={p.name}
                  secondary={p.key}
                  isActive={active === projectStart + idx}
                  onMouseEnter={() => setActive(projectStart + idx)}
                  onClick={() => go(rows[projectStart + idx])}
                />
              ))}
            </Group>
          )}
        </div>
      </div>
    </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  icon,
  primary,
  secondary,
  isActive,
  onClick,
  onMouseEnter,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
        isActive ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{primary}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{secondary}</span>
    </button>
  );
}
