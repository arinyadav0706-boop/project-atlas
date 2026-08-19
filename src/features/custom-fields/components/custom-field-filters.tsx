"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  isValueless,
  operatorsFor,
  type CustomFieldOperator,
  type CustomFieldPredicate,
} from "@/features/custom-fields/lib/field-predicate";
import type {
  CustomFieldDefinitionDto,
  CustomFieldTypeDto,
} from "@/features/custom-fields/types/custom-field.types";

// Custom-field filter chips on /issues (ADR-0043).
//
// One row per predicate: field · operator · value. Adding a field starts it at
// the operator its type makes most useful, so the common case is one click and
// a value rather than three dropdowns.

const OP_LABEL: Record<CustomFieldOperator, string> = {
  eq: "is",
  contains: "contains",
  gt: "is after / over",
  lt: "is before / under",
  any_of: "is any of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** The operator a reader most likely wants when they pick this type. */
function defaultOperator(type: CustomFieldTypeDto): CustomFieldOperator {
  if (type === "TEXT" || type === "URL") return "contains";
  if (type === "SELECT" || type === "MULTI_SELECT" || type === "USER") return "any_of";
  return "eq";
}

export function CustomFieldFilters({
  fields,
  predicates,
  onChange,
}: {
  fields: CustomFieldDefinitionDto[];
  predicates: CustomFieldPredicate[];
  onChange: (next: CustomFieldPredicate[]) => void;
}) {
  if (fields.length === 0) return null;

  const used = new Set(predicates.map((p) => p.fieldId));
  const addable = fields.filter((f) => !used.has(f.id));

  function update(index: number, patch: Partial<CustomFieldPredicate>) {
    const next = predicates.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {predicates.map((predicate, i) => {
        const field = fields.find((f) => f.id === predicate.fieldId);
        // A predicate whose field has since been deleted: shown as removable
        // rather than hidden, so a saved view can be repaired instead of
        // silently filtering on something invisible.
        if (!field) {
          return (
            <Chip key={`${predicate.fieldId}-${i}`} onRemove={() => onChange(predicates.filter((_, j) => j !== i))}>
              <span className="text-[12px] text-muted-foreground">Removed field</span>
            </Chip>
          );
        }

        return (
          <Chip
            key={`${predicate.fieldId}-${i}`}
            onRemove={() => onChange(predicates.filter((_, j) => j !== i))}
          >
            <span className="text-[12px] font-medium text-foreground">{field.name}</span>

            <Bare
              label={`${field.name} operator`}
              value={predicate.op}
              onChange={(op) =>
                update(i, {
                  op: op as CustomFieldOperator,
                  // Switching to/from a valueless operator must not leave a
                  // stale value behind that the server would then apply.
                  value: isValueless(op as CustomFieldOperator) ? undefined : predicate.value,
                })
              }
              options={operatorsFor(field.type).map((op) => ({
                value: op,
                label: OP_LABEL[op],
              }))}
            />

            {!isValueless(predicate.op) && (
              <ValueControl
                field={field}
                predicate={predicate}
                onChange={(value) => update(i, { value })}
              />
            )}
          </Chip>
        );
      })}

      {addable.length > 0 && (
        <Select
          value=""
          onValueChange={(fieldId) => {
            const field = fields.find((f) => f.id === fieldId);
            if (!field) return;
            onChange([
              ...predicates,
              { fieldId, op: defaultOperator(field.type) },
            ]);
          }}
        >
          <SelectTrigger
            aria-label="Add a field filter"
            className="h-9 w-auto min-w-[9rem] text-[13px]"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              Field filter
            </span>
          </SelectTrigger>
          <SelectContent>
            {addable.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ValueControl({
  field,
  predicate,
  onChange,
}: {
  field: CustomFieldDefinitionDto;
  predicate: CustomFieldPredicate;
  onChange: (value: string | string[]) => void;
}) {
  const single = Array.isArray(predicate.value) ? predicate.value[0] : predicate.value;

  if (field.type === "SELECT" || field.type === "MULTI_SELECT") {
    const chosen = new Set(Array.isArray(predicate.value) ? predicate.value : []);
    return (
      <span className="flex flex-wrap items-center gap-1">
        {field.options.map((o) => {
          const on = chosen.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(chosen);
                if (!next.delete(o.id)) next.add(o.id);
                onChange([...next]);
              }}
              className={
                on
                  ? "rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                  : "rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              }
            >
              {o.label}
            </button>
          );
        })}
      </span>
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <Bare
        label={`${field.name} value`}
        value={single ?? "true"}
        onChange={onChange}
        options={[
          { value: "true", label: "checked" },
          { value: "false", label: "unchecked" },
        ]}
      />
    );
  }

  if (field.type === "USER") {
    // No people picker yet (CF-4). Rather than a broken control, the operator
    // menu still offers is_empty / is_not_empty, which need no value.
    return (
      <span className="text-[11px] text-muted-foreground">
        pick “is empty” or “is not empty”
      </span>
    );
  }

  return (
    <Input
      value={single ?? ""}
      type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
      aria-label={`${field.name} value`}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-32 text-[12px]"
    />
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1 shadow-card">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this filter"
        className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Bare({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-7 w-auto min-w-0 gap-1 border-0 bg-transparent px-1 text-[12px] shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
