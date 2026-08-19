"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { hasOptions } from "@/features/custom-fields/types/custom-field.types";
import type {
  CustomFieldDefinitionDto,
  ProjectCustomFieldsDto,
} from "@/features/custom-fields/types/custom-field.types";

// Project → Settings → Custom fields (24_custom_fields.md §5).
//
// Enabled on the left with up/down ordering, available on the right. Arrows
// rather than drag-and-drop: the list is short and capped at 30, and arrows are
// keyboard-operable for free, where the board's dnd-kit setup would need a
// keyboard sensor configured to match.
export function ProjectCustomFields({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectCustomFieldsDto;
}) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function commit(enabled: CustomFieldDefinitionDto[]) {
    // Optimistic: the list re-renders immediately and reverts on failure, so
    // reordering does not feel like it is fighting the network.
    const previous = state;
    setState({ ...state, enabled, available: state.available });
    setSaving(true);
    try {
      const updated = await apiRequest<ProjectCustomFieldsDto>(
        `/api/projects/${projectId}/custom-fields`,
        { method: "PUT", body: { fieldIds: enabled.map((f) => f.id) } },
      );
      setState(updated);
    } catch (error) {
      setState(previous);
      toast.error(error instanceof Error ? error.message : "Couldn't save the field list.");
    } finally {
      setSaving(false);
    }
  }

  function enable(field: CustomFieldDefinitionDto) {
    void commit([...state.enabled, field]);
  }

  function disable(field: CustomFieldDefinitionDto) {
    void commit(state.enabled.filter((f) => f.id !== field.id));
  }

  function move(index: number, delta: number) {
    const next = [...state.enabled];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void commit(next);
  }

  if (!state.canManage) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {state.enabled.length === 0
          ? "No custom fields are shown on this project."
          : `This project shows ${state.enabled.length} custom ${state.enabled.length === 1 ? "field" : "fields"}. Only a project lead can change them.`}
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Column
        title="Shown on issues"
        empty="Nothing yet — add a field from the right."
        count={state.enabled.length}
      >
        {state.enabled.map((field, i) => (
          <Row key={field.id} field={field}>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || i === 0}
              aria-label={`Move ${field.name} up`}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || i === state.enabled.length - 1}
              aria-label={`Move ${field.name} down`}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              aria-label={`Remove ${field.name} from this project`}
              onClick={() => disable(field)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </Row>
        ))}
      </Column>

      <Column
        title="Available"
        empty="Every field in the library is already on this project."
        count={state.available.length}
      >
        {state.available.map((field) => (
          <Row key={field.id} field={field}>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              aria-label={`Add ${field.name} to this project`}
              onClick={() => enable(field)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </Row>
        ))}
      </Column>
    </div>
  );
}

function Column({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {title}
        <span className="font-normal normal-case">({count})</span>
      </h3>
      {count === 0 ? (
        <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-[13px] text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

function Row({
  field,
  children,
}: {
  field: CustomFieldDefinitionDto;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {field.name}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {field.type.replace("_", "-").toLowerCase()}
          {hasOptions(field.type) ? ` · ${field.options.length} options` : ""}
          {field.required ? " · required on new issues" : ""}
        </span>
      </span>
      {children}
    </li>
  );
}
