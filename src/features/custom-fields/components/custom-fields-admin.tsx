"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
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
import {
  CUSTOM_FIELD_TYPES,
  hasOptions,
  type CustomFieldDefinitionDto,
  type CustomFieldTypeDto,
} from "@/features/custom-fields/types/custom-field.types";

// Admin → Custom Fields: the org field library (24_custom_fields.md §5).

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

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
            // `type` only on create — it is immutable afterwards (BR-2), and
            // the PATCH schema rejects it outright rather than ignoring it.
            body: { ...body, type: draft.type, options: draft.options },
          });

      setFields((prev) =>
        draft.id ? prev.map((f) => (f.id === saved.id ? saved : f)) : [...prev, saved],
      );
      setDraft(null);
      toast.success(draft.id ? "Field updated." : `Created "${saved.name}".`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the field.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: CustomFieldDefinitionDto) {
    try {
      await apiRequest(`/api/admin/custom-fields/${field.id}`, { method: "DELETE" });
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      toast.success(`Removed "${field.name}". Existing values are kept.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the field.");
    }
  }

  const needsOptions = draft ? hasOptions(draft.type) : false;
  const valid =
    draft !== null &&
    draft.name.trim().length > 0 &&
    (!needsOptions || draft.options.some((o) => o.label.trim().length > 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Fields defined here can be switched on per project, in Project → Settings.
        </p>
        <Button size="sm" onClick={() => setDraft({ ...BLANK })}>
          <Plus className="h-3.5 w-3.5" />
          New field
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SlidersHorizontal />}
            title="No custom fields yet"
            description="Add a field to capture something the built-in ones don't — a customer, an environment, a risk rating."
          />
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background shadow-card">
          {fields.map((field) => (
            <li key={field.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-foreground">{field.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {TYPE_LABEL[field.type]}
                  </span>
                  {field.required && (
                    <span className="text-[11px] font-medium text-warning">Required</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {field.description ? `${field.description} · ` : ""}
                  {/* The "is this safe to remove" signal. */}
                  {field.projectCount === 0
                    ? "Not used by any project"
                    : `Used by ${field.projectCount} ${field.projectCount === 1 ? "project" : "projects"}`}
                  {hasOptions(field.type) ? ` · ${field.options.length} options` : ""}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
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
                aria-label={`Remove ${field.name}`}
                onClick={() => remove(field)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogTitle>{draft?.id ? "Edit field" : "New field"}</DialogTitle>
          <DialogDescription>
            {draft?.id
              ? "The type can't change — every stored value would be reinterpreted. Create a new field instead."
              : "Choose the type carefully: it's fixed once the field exists."}
          </DialogDescription>

          {draft && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="cf-name">Name</Label>
                <Input
                  id="cf-name"
                  value={draft.name}
                  autoFocus
                  maxLength={60}
                  placeholder="Customer"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="cf-type">Type</Label>
                <Select
                  value={draft.type}
                  disabled={Boolean(draft.id)}
                  onValueChange={(v) =>
                    setDraft({ ...draft, type: v as CustomFieldTypeDto, options: [] })
                  }
                >
                  <SelectTrigger id="cf-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cf-desc">Description (optional)</Label>
                <Input
                  id="cf-desc"
                  value={draft.description}
                  maxLength={300}
                  placeholder="Shown under the field on the issue"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              {needsOptions && (
                <div>
                  <Label>Options</Label>
                  <div className="mt-1 space-y-2">
                    {draft.options.map((option, i) => (
                      <div key={option.id ?? `new-${i}`} className="flex items-center gap-2">
                        <Input
                          value={option.label}
                          maxLength={60}
                          aria-label={`Option ${i + 1}`}
                          onChange={(e) => {
                            const options = [...draft.options];
                            options[i] = { ...option, label: e.target.value };
                            setDraft({ ...draft, options });
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove option ${i + 1}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              options: draft.options.filter((_, j) => j !== i),
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({ ...draft, options: [...draft.options, { label: "" }] })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add option
                    </Button>
                    {/* Says what the id-based model buys, at the moment it
                        matters — when someone is about to rename one. */}
                    <p className="text-[11px] text-muted-foreground">
                      Renaming an option keeps it on every issue that already has it.
                    </p>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3">
                <Switch
                  checked={draft.required}
                  onCheckedChange={(required) => setDraft({ ...draft, required })}
                />
                <span className="text-[13px] text-foreground">
                  Required on new issues
                  <span className="block text-[11px] text-muted-foreground">
                    Existing issues aren&apos;t affected, and edits aren&apos;t blocked.
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!valid}>
              {draft?.id ? "Save changes" : "Create field"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
