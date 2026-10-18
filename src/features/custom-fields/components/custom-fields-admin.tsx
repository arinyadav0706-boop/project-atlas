"use client";

import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import {
  CUSTOM_FIELD_TYPES,
  hasOptions,
  type CustomFieldDefinitionDto,
  type CustomFieldTypeDto,
} from "@/features/custom-fields/types/custom-field.types";

const TYPE_LABEL: Record<CustomFieldTypeDto, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  CHECKBOX: "Checkbox",
  SELECT: "Select",
  MULTI_SELECT: "Multi-select",
  USER: "Person",
  URL: "Link",
};

interface Draft {
  id?: string;
  name: string;
  type: CustomFieldTypeDto;
  description: string;
  required: boolean;
  options: { id?: string; label: string }[];
}

const BLANK: Draft = {
  name: "",
  type: "TEXT",
  description: "",
  required: false,
  options: [],
};

export function CustomFieldsAdmin({ initial }: { initial: CustomFieldDefinitionDto[] }) {
  const [fields, setFields] = useState(initial);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  // Search filtering
  const filteredFields = useMemo(() => {
    if (!query.trim()) return fields;
    const q = query.toLowerCase().trim();
    return fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        TYPE_LABEL[f.type].toLowerCase().includes(q)
    );
  }, [fields, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredFields,
    initialPageSize: 10,
    itemLabel: "custom fields",
    resetDeps: [query],
  });

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const body = {
        name: draft.name,
        description: draft.description.trim() || null,
        required: draft.required,
        ...(hasOptions(draft.type) ? { options: draft.options } : {}),
      };
      const saved = draft.id
        ? await apiRequest<CustomFieldDefinitionDto>(`/api/admin/custom-fields/${draft.id}`, {
            method: "PATCH",
            body,
          })
        : await apiRequest<CustomFieldDefinitionDto>("/api/admin/custom-fields", {
            method: "POST",
            body: { ...body, type: draft.type },
          });

      setFields((prev) => {
        const next = draft.id ? prev.map((f) => (f.id === draft.id ? saved : f)) : [...prev, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      toast.success(draft.id ? "Field updated" : "Field created");
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the field.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: CustomFieldDefinitionDto) {
    if (busy) return;
    if (
      field.projectCount > 0 &&
      !confirm(
        `“${field.name}” is enabled on ${field.projectCount} project(s). Deleting it will drop its values from all issues in those projects. Are you sure?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/admin/custom-fields/${field.id}`, { method: "DELETE" });
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      toast.success(`Deleted “${field.name}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the field.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Control Bar: Search + Create Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-surface p-3 shadow-2xs">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search custom fields…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button size="sm" onClick={() => setDraft({ ...BLANK })} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New field
        </Button>
      </div>

      {/* Paginated Custom Fields Table */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        {fields.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<SlidersHorizontal className="h-6 w-6 text-muted-foreground" />}
              title="No custom fields yet"
              description="Add a field to capture specific issue metadata across your projects — risk rating, customer name, target version."
            />
          </div>
        ) : filteredFields.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No custom fields match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {paginatedItems.map((field) => (
              <div
                key={field.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{field.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {TYPE_LABEL[field.type]}
                    </Badge>
                    {field.required && (
                      <span className="rounded-xs bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {field.description ? `${field.description} · ` : ""}
                    {field.projectCount === 0
                      ? "Not enabled on any projects"
                      : `Enabled on ${field.projectCount} ${field.projectCount === 1 ? "project" : "projects"}`}
                    {hasOptions(field.type) ? ` · ${field.options.length} options` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() =>
                      setDraft({
                        id: field.id,
                        name: field.name,
                        type: field.type,
                        description: field.description ?? "",
                        required: field.required,
                        options: field.options.map((o) => ({ id: o.id, label: o.label })),
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(field)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DataPagination {...paginationProps} pageSizeOptions={[5, 10, 20]} />
      </div>

      {/* Draft Modal */}
      {draft && (
        <Dialog open onOpenChange={(open) => !open && setDraft(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle className="text-base font-semibold">
              {draft.id ? "Edit custom field" : "Create custom field"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define the field name, type, and options available across your workspace.
            </DialogDescription>

            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Field Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Impact Level"
                  className="mt-1 h-8 text-xs"
                />
              </div>

              {!draft.id && (
                <div>
                  <Label className="text-xs">Field Type</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(t) =>
                      setDraft({
                        ...draft,
                        type: t as CustomFieldTypeDto,
                        options: hasOptions(t as CustomFieldTypeDto) ? [{ label: "" }] : [],
                      })
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOM_FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs">Description (Optional)</Label>
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Helps team members understand how to populate this field"
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs">Required by default</Label>
                <Switch
                  checked={draft.required}
                  onCheckedChange={(checked) => setDraft({ ...draft, required: checked })}
                />
              </div>

              {hasOptions(draft.type) && (
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <Label className="text-xs">Options</Label>
                  {draft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const next = [...draft.options];
                          next[i] = { ...next[i], label: e.target.value };
                          setDraft({ ...draft, options: next });
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const next = draft.options.filter((_, idx) => idx !== i);
                          setDraft({ ...draft, options: next });
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "" }] })}
                    className="h-7 text-xs"
                  >
                    Add Option
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/50 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={busy || !draft.name.trim()}
                className="h-8 text-xs"
              >
                {draft.id ? "Save Changes" : "Create Field"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
