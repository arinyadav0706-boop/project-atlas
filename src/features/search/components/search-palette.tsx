"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, FolderKanban, CircleDot } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import type { SearchResponseDto } from "@/features/search/types/search.types";

const DEBOUNCE_MS = 180;
const EMPTY: SearchResponseDto = { issues: [], projects: [] };

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
  const seq = useRef(0);

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

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setActive(0);
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

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
        className="flex h-9 w-full items-center justify-between gap-3 rounded-full border border-border/75 bg-surface-sunken/70 px-3.5 text-[13px] text-muted-foreground shadow-2xs transition-all hover:border-border-strong hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
      >
        <span className="flex items-center gap-2 truncate">
          <Search className="h-4 w-4 shrink-0 text-primary/80" />
          <span className="truncate">Search issues, projects, or jump to…</span>
        </span>
        <kbd className="hidden shrink-0 rounded-full border border-border/80 bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 backdrop-blur-sm p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-border/70 bg-surface/95 shadow-pop backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border-subtle px-5">
              <Search className="h-4.5 w-4.5 shrink-0 text-primary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search issues and projects…"
                aria-label="Search issues and projects"
                className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {loading && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {!hasQuery && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search across your workspace.
                </p>
              )}
              {hasQuery && !loading && rows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results for “{query.trim()}”.
                </p>
              )}

              {results.issues.length > 0 && (
                <Group label="Issues">
                  {results.issues.map((i, idx) => (
                    <ResultRow
                      key={i.id}
                      icon={<CircleDot className="h-4 w-4 text-primary" />}
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
                      icon={<FolderKanban className="h-4 w-4 text-violet-500" />}
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
    <div className="py-1.5">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
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
      className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors ${
        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{primary}</span>
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
        {secondary}
      </span>
    </button>
  );
}
