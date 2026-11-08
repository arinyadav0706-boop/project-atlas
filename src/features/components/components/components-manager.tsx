"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Check, X, Search } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { usePagination } from "@/shared/hooks/use-pagination";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import type {
  ComponentDto,
  ComponentListDto,
} from "@/features/components/types/component.types";

const NO_OWNER = "__none__";

type Member = { userId: string; name: string };

export function ComponentsManager({
  projectId,
  members,
}: {
  projectId: string;
  members: Member[];
}) {
  const [items, setItems] = useState<ComponentDto[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState<string>(NO_OWNER);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiRequest<ComponentListDto>(`/api/projects/${projectId}/components`)
      .then((data) => {
        setItems(data.items);
        setCanManage(data.canManage);
      })
      .catch(() => toast.error("Couldn't load components."))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await apiRequest<ComponentDto>(
        `/api/projects/${projectId}/components`,
        { method: "POST", body: { name: trimmed, ownerId: ownerId === NO_OWNER ? null : ownerId } },
      );
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setOwnerId(NO_OWNER);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the component.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/api/components/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the component.");
    }
  }

  function onSaved(updated: ComponentDto) {
    setItems((prev) =>
      prev
        .map((c) => (c.id === updated.id ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.owner?.name && c.owner.name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const { paginatedItems, paginationProps } = usePagination({
    items: filtered,
    initialPageSize: 10,
    itemLabel: "components",
    resetDeps: [search],
  });

  if (loading) return <p className="text-sm text-muted-foreground">Loading components…</p>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-surface/50 p-3 shadow-2xs">
          <Input
            aria-label="New component name"
            placeholder="New component name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="h-8 w-auto min-w-40 text-xs" aria-label="Owner">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_OWNER}>No owner</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()} className="h-8 text-xs">
            Add component
          </Button>
        </div>
      )}

      {items.length > 5 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            {items.length === 0 ? "No components yet." : "No matching components found."}
          </p>
        )}
        {paginatedItems.map((component) => (
          <ComponentRow
            key={component.id}
            component={component}
            members={members}
            canManage={canManage}
            onSaved={onSaved}
            onRemove={() => remove(component.id)}
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

function ComponentRow({
  component,
  members,
  canManage,
  onSaved,
  onRemove,
}: {
  component: ComponentDto;
  members: Member[];
  canManage: boolean;
  onSaved: (c: ComponentDto) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(component.name);
  const [ownerId, setOwnerId] = useState<string>(component.owner?.id ?? NO_OWNER);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await apiRequest<ComponentDto>(`/api/components/${component.id}`, {
        method: "PATCH",
        body: { name: name.trim(), ownerId: ownerId === NO_OWNER ? null : ownerId },
      });
      onSaved(updated);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the component.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 shadow-2xs">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs text-xs" />
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger className="h-7 w-auto min-w-40 text-xs" aria-label="Owner">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_OWNER}>No owner</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/30">
      <span className="flex-1 font-medium text-foreground">{component.name}</span>
      {component.owner && (
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {component.owner.name}
        </span>
      )}
      {canManage && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${component.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${component.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
