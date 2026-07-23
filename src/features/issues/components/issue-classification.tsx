"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Tag, Boxes } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { LabelDto, LabelListDto } from "@/features/labels/types/label.types";
import type {
  ComponentDto,
  ComponentListDto,
} from "@/features/components/types/component.types";

// Labels + components on the issue detail (17_labels.md, 18_components.md).
// Both are chip lists with an add-dropdown. Labels can be created inline by any
// member (BR-1); components are selected from the project's set (LEADs manage
// them in Settings). Writes replace the whole set via the idempotent PUT.

// A small, fixed palette for inline-created labels so colors stay legible in
// both themes without a color picker in the MVP.
const LABEL_PALETTE = [
  "#2563EB", "#7C3AED", "#DB2777", "#DC2626", "#EA580C",
  "#CA8A04", "#16A34A", "#0891B2", "#4F46E5", "#0D9488",
];

export function IssueClassification({
  issueId,
  canWrite,
  initialLabels,
  labelCatalog,
  initialComponents,
  componentCatalog,
}: {
  issueId: string;
  canWrite: boolean;
  initialLabels: LabelDto[];
  labelCatalog: LabelListDto;
  initialComponents: ComponentDto[];
  componentCatalog: ComponentListDto;
}) {
  const router = useRouter();
  const [labels, setLabels] = useState<LabelDto[]>(initialLabels);
  const [catalog, setCatalog] = useState<LabelDto[]>(labelCatalog.items);
  const [components, setComponents] = useState<ComponentDto[]>(initialComponents);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedLabelIds = useMemo(() => new Set(labels.map((l) => l.id)), [labels]);
  const selectedComponentIds = useMemo(
    () => new Set(components.map((c) => c.id)),
    [components],
  );

  const filtered = catalog.filter((l) =>
    l.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exactExists = catalog.some(
    (l) => l.name.toLowerCase() === query.trim().toLowerCase(),
  );

  async function setIssueLabels(ids: string[]) {
    setBusy(true);
    try {
      const updated = await apiRequest<LabelDto[]>(`/api/issues/${issueId}/labels`, {
        method: "PUT",
        body: { labelIds: ids },
      });
      setLabels(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update labels.");
    } finally {
      setBusy(false);
    }
  }

  function toggleLabel(id: string) {
    const ids = selectedLabelIds.has(id)
      ? labels.filter((l) => l.id !== id).map((l) => l.id)
      : [...labels.map((l) => l.id), id];
    void setIssueLabels(ids);
  }

  async function createAndAddLabel() {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const color = LABEL_PALETTE[catalog.length % LABEL_PALETTE.length]!;
      const created = await apiRequest<LabelDto>(`/api/labels`, {
        method: "POST",
        body: { name, color },
      });
      setCatalog((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setQuery("");
      await setIssueLabels([...labels.map((l) => l.id), created.id]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the label.");
    } finally {
      setBusy(false);
    }
  }

  async function setIssueComponents(ids: string[]) {
    setBusy(true);
    try {
      const updated = await apiRequest<ComponentDto[]>(
        `/api/issues/${issueId}/components`,
        { method: "PUT", body: { componentIds: ids } },
      );
      setComponents(updated);
      // A newly added component with a lead may have auto-assigned the issue —
      // refresh so the assignee panel reflects it (BR-3).
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update components.");
    } finally {
      setBusy(false);
    }
  }

  function toggleComponent(id: string) {
    const ids = selectedComponentIds.has(id)
      ? components.filter((c) => c.id !== id).map((c) => c.id)
      : [...components.map((c) => c.id), id];
    void setIssueComponents(ids);
  }

  return (
    <div className="space-y-4">
      {/* Labels */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Tag className="h-3.5 w-3.5" /> Labels
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              removable={canWrite}
              onRemove={() => toggleLabel(label.id)}
            />
          ))}
          {labels.length === 0 && !canWrite && (
            <span className="text-sm text-muted-foreground">None</span>
          )}
          {canWrite && (
            <DropdownMenu onOpenChange={(o) => !o && setQuery("")}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  aria-label="Add label"
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && query.trim() && !exactExists) {
                      e.preventDefault();
                      void createAndAddLabel();
                    }
                  }}
                  placeholder="Filter or create…"
                  className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <div className="max-h-56 overflow-y-auto">
                  {filtered.map((label) => (
                    <DropdownMenuItem
                      key={label.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleLabel(label.id);
                      }}
                      className="gap-2 text-sm"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 truncate">{label.name}</span>
                      {selectedLabelIds.has(label.id) && (
                        <span className="text-xs text-accent">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  {query.trim() && !exactExists && labelCatalog.canCreate && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void createAndAddLabel();
                      }}
                      className="gap-2 text-sm"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create &ldquo;{query.trim()}&rdquo;
                    </DropdownMenuItem>
                  )}
                  {filtered.length === 0 && !query.trim() && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      No labels yet.
                    </p>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Components */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" /> Components
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {components.map((component) => (
            <ComponentChip
              key={component.id}
              component={component}
              removable={canWrite}
              onRemove={() => toggleComponent(component.id)}
            />
          ))}
          {components.length === 0 && !canWrite && (
            <span className="text-sm text-muted-foreground">None</span>
          )}
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  aria-label="Add component"
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <div className="max-h-56 overflow-y-auto">
                  {componentCatalog.items.map((component) => (
                    <DropdownMenuItem
                      key={component.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleComponent(component.id);
                      }}
                      className="gap-2 text-sm"
                    >
                      <span className="flex-1 truncate">{component.name}</span>
                      {selectedComponentIds.has(component.id) && (
                        <span className="text-xs text-accent">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  {componentCatalog.items.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      No components. A project lead can add them in Settings.
                    </p>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelChip({
  label,
  removable,
  onRemove,
}: {
  label: LabelDto;
  removable: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove label ${label.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      )}
    </span>
  );
}

function ComponentChip({
  component,
  removable,
  onRemove,
}: {
  component: ComponentDto;
  removable: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      {component.name}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove component ${component.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      )}
    </span>
  );
}
