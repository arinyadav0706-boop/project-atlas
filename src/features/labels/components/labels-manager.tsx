"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import type { LabelDto, LabelListDto } from "@/features/labels/types/label.types";

// Org-wide label catalog management (17_labels.md). Any member may create;
// rename/recolor/delete is manage-gated server-side, mirrored here by hiding
// the controls when `canManage` is false (the server re-checks — BR-2).
const DEFAULT_COLOR = "#2563EB";

export function LabelsManager() {
  const [items, setItems] = useState<LabelDto[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);

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

  if (loading) return <p className="text-sm text-muted-foreground">Loading labels…</p>;

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Label color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-background"
          />
          <Input
            aria-label="New label name"
            placeholder="New label name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="h-8 max-w-xs"
          />
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
            Add label
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        )}
        {items.map((label) => (
          <LabelRow
            key={label.id}
            label={label}
            canManage={canManage}
            onSaved={onSaved}
            onRemove={() => remove(label.id)}
          />
        ))}
      </div>
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
      <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
        <input
          type="color"
          aria-label="Label color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-border"
        />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs" />
        <Button size="sm" variant="ghost" onClick={save} loading={busy} aria-label="Save">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
      <span className="flex-1 text-sm">{label.name}</span>
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${label.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
