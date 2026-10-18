"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Check, X, Search } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { usePagination } from "@/shared/hooks/use-pagination";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import type { LabelDto, LabelListDto } from "@/features/labels/types/label.types";

const DEFAULT_COLOR = "#2563EB";

export function LabelsManager() {
  const [items, setItems] = useState<LabelDto[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiRequest<LabelListDto>("/api/labels")
      .then((data) => {
        setItems(data.items);
        setCanCreate(data.canCreate);
        setCanManage(data.canManage);
      })
      .catch(() => toast.error("Couldn't load labels."))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await apiRequest<LabelDto>("/api/labels", {
        method: "POST",
        body: { name: trimmed, color },
      });
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setColor(DEFAULT_COLOR);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the label.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/api/labels/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((l) => l.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the label.");
    }
  }

  function onSaved(updated: LabelDto) {
    setItems((prev) =>
      prev.map((l) => (l.id === updated.id ? updated : l)).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((l) => l.name.toLowerCase().includes(q));
  }, [items, search]);

  const { paginatedItems, paginationProps } = usePagination({
    items: filtered,
    initialPageSize: 10,
    itemLabel: "labels",
    resetDeps: [search],
  });

  if (loading) return <p className="text-sm text-muted-foreground">Loading labels…</p>;

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface/50 p-3 shadow-2xs">
          <input
            type="color"
            aria-label="Label color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-lg border border-border/70 bg-background"
          />
          <Input
            aria-label="New label name"
            placeholder="New label name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="h-8 max-w-xs text-xs"
          />
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()} className="h-8 text-xs">
            Add label
          </Button>
        </div>
      )}

      {items.length > 5 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            {items.length === 0 ? "No labels yet." : "No matching labels found."}
          </p>
        )}
        {paginatedItems.map((label) => (
          <LabelRow
            key={label.id}
            label={label}
            canManage={canManage}
            onSaved={onSaved}
            onRemove={() => remove(label.id)}
          />
        ))}
      </div>

      {filtered.length > 10 && (
        <div className="pt-2 border-t border-border/60">
          <DataPagination {...paginationProps} />
        </div>
      )}
    </div>
  );
}

function LabelRow({
  label,
  canManage,
  onSaved,
  onRemove,
}: {
  label: LabelDto;
  canManage: boolean;
  onSaved: (l: LabelDto) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await apiRequest<LabelDto>(`/api/labels/${label.id}`, {
        method: "PATCH",
        body: { name: name.trim(), color },
      });
      onSaved(updated);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the label.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 shadow-2xs">
        <input
          type="color"
          aria-label="Label color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-border"
        />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs text-xs" />
        <Button size="sm" variant="ghost" onClick={save} loading={busy} aria-label="Save" className="h-7 px-2">
          <Check className="h-3.5 w-3.5 text-primary" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel" className="h-7 px-2">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/30">
      <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-border/50" style={{ backgroundColor: label.color }} />
      <span className="flex-1 font-medium text-foreground">{label.name}</span>
      {canManage && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${label.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
