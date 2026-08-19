"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import type {
  CustomFieldValueDto,
  IssueCustomFieldDto,
} from "@/features/custom-fields/types/custom-field.types";

// One control per field type (24_custom_fields.md §5).
//
// Text-ish types commit on BLUR rather than on every keystroke: a PUT per
// character would be a write per character. Discrete types (checkbox, select,
// date) commit immediately, because there is no "still typing" state to wait
// for and waiting would make them feel broken.
const CLEAR = "__clear__";

export function CustomFieldControl({
  field,
  disabled,
  onCommit,
}: {
  field: IssueCustomFieldDto;
  disabled: boolean;
  onCommit: (value: CustomFieldValueDto) => void;
}) {
  switch (field.type) {
    case "TEXT":
    case "URL":
      return <Textish field={field} disabled={disabled} onCommit={onCommit} />;

    case "NUMBER":
      return <Numberish field={field} disabled={disabled} onCommit={onCommit} />;

    case "DATE":
      return (
        <Input
          type="date"
          disabled={disabled}
          aria-label={field.name}
          // `<input type="date">` wants YYYY-MM-DD; the DTO carries a full ISO
          // string, so it is trimmed here rather than stored differently.
          defaultValue={typeof field.value === "string" ? field.value.slice(0, 10) : ""}
          onChange={(e) => onCommit(e.target.value ? e.target.value : null)}
          className="h-8 text-[13px]"
        />
      );

    case "CHECKBOX":
      return (
        <Checkbox
          checked={field.value === true}
          disabled={disabled}
          aria-label={field.name}
          // `false` is a real value here, not a clear — "we checked and it is
          // not the case" differs from "nobody has said".
          onClick={() => onCommit(field.value === true ? false : true)}
        />
      );

    case "SELECT":
      return (
        <Select
          value={typeof field.value === "string" ? field.value : CLEAR}
          disabled={disabled}
          onValueChange={(v) => onCommit(v === CLEAR ? null : v)}
        >
          <SelectTrigger aria-label={field.name} className="h-8 text-[13px]">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLEAR}>—</SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "MULTI_SELECT":
      return <MultiSelect field={field} disabled={disabled} onCommit={onCommit} />;

    case "USER":
      // Read-only for now: a people picker needs the project's member list,
      // which this component is not given. The value still displays, so a
      // field set through the API is not invisible.
      return field.user ? (
        <span className="text-[13px] text-foreground">{field.user.name}</span>
      ) : (
        <span className="text-[13px] text-muted-foreground">—</span>
      );
  }
}

function Textish({
  field,
  disabled,
  onCommit,
}: {
  field: IssueCustomFieldDto;
  disabled: boolean;
  onCommit: (value: CustomFieldValueDto) => void;
}) {
  const initial = typeof field.value === "string" ? field.value : "";
  const [draft, setDraft] = useState(initial);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={draft}
        disabled={disabled}
        aria-label={field.name}
        inputMode={field.type === "URL" ? "url" : "text"}
        placeholder={field.type === "URL" ? "https://…" : "—"}
        onChange={(e) => setDraft(e.target.value)}
        // Commit on blur, and on Enter for people who never leave the keyboard.
        onBlur={() => draft !== initial && onCommit(draft === "" ? null : draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(initial);
        }}
        className="h-8 text-[13px]"
      />
      {field.type === "URL" && initial !== "" && (
        <a
          href={initial}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${field.name}`}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function Numberish({
  field,
  disabled,
  onCommit,
}: {
  field: IssueCustomFieldDto;
  disabled: boolean;
  onCommit: (value: CustomFieldValueDto) => void;
}) {
  const initial = typeof field.value === "number" ? String(field.value) : "";
  const [draft, setDraft] = useState(initial);

  return (
    <Input
      type="number"
      value={draft}
      disabled={disabled}
      aria-label={field.name}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== initial && onCommit(draft === "" ? null : draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(initial);
      }}
      className="h-8 text-[13px] tabular-nums"
    />
  );
}

// Checkable chips rather than a multi-select listbox: the options are few by
// design, and a row of chips shows the current selection without opening
// anything.
function MultiSelect({
  field,
  disabled,
  onCommit,
}: {
  field: IssueCustomFieldDto;
  disabled: boolean;
  onCommit: (value: CustomFieldValueDto) => void;
}) {
  const selected = new Set(Array.isArray(field.value) ? field.value : []);

  return (
    <div className="flex flex-wrap gap-1">
      {field.options.map((o) => {
        const on = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => {
              const next = new Set(selected);
              if (!next.delete(o.id)) next.add(o.id);
              onCommit([...next]);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              on
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {on && <Check className="h-3 w-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
