"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Check, X } from "lucide-react";
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
import type {
  ComponentDto,
  ComponentListDto,
} from "@/features/components/types/component.types";

// Project-scoped component management (18_components.md). CRUD is LEAD-only
// (server-enforced, BR-1); a component.s owner auto-assigns new work (BR-3).
// `Select` has no empty value, so "no owner" maps to a sentinel → null on save.
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

  if (loading) return <p className="text-sm text-muted-foreground">Loading components…</p>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="New component name"
            placeholder="New component name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 max-w-xs"
          />
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="h-8 w-auto min-w-40 text-sm" aria-label="Owner">
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
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
            Add component
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No components yet.</p>
        )}
        {items.map((component) => (
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
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs" />
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger className="h-7 w-auto min-w-40 text-sm" aria-label="Owner">
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
      <span className="flex-1 text-sm">{component.name}</span>
      {component.owner && (
        <span className="text-xs text-muted-foreground">→ {component.owner.name}</span>
      )}
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${component.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${component.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
