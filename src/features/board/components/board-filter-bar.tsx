"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  FilterChip,
  FilterPanel,
  FilterRow,
  FilterToggleGroup,
  FiltersButton,
} from "@/shared/components/data/filter-bar";
import { cn } from "@/shared/lib/utils";
import { typeLabel, priorityLabel } from "@/features/issues/components/issue-meta";
import type { BoardFilter } from "@/features/board/types/board.types";
import type {
  IssuePriorityDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// The board's filters, on the shared grammar (`shared/components/data/filter-bar`).
//
// Every facet the V1 bar had is still here — assignee, type, priority, epic,
// sprint, labels, components, search. What changed is where they live: eight
// controls wrapped to three lines above the board and pushed the first card
// below the fold, which on the one screen people leave open all day is the
// expensive kind of waste. Now: search inline, everything else in the panel,
// and a chip for each one that is on.

const TYPES: IssueTypeDto[] = ["TASK", "STORY", "BUG", "EPIC"];
const PRIORITIES: IssuePriorityDto[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

/** `Select` forbids an empty value, so "Any" maps to removing the key. */
const ANY = "__any__";

export interface BoardFilterOptions {
  members: { userId: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  components: { id: string; name: string }[];
  epics: { id: string; key: string; title: string }[];
  /**
   * Sprints that can meaningfully scope a board. Optional so a kanban project
   * omits the control rather than rendering an empty one.
   */
  sprints?: { id: string; name: string; status: string }[];
}

export function BoardFilterBar({
  members,
  labels,
  components,
  epics,
  sprints = [],
  filter,
  onChange,
}: BoardFilterOptions & {
  filter: BoardFilter;
  onChange: (next: BoardFilter) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  function set<K extends keyof BoardFilter>(key: K, value: BoardFilter[K] | undefined) {
    const next = { ...filter };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  function toggleId(key: "labelIds" | "componentIds", id: string) {
    const set_ = new Set(filter[key] ?? []);
    if (!set_.delete(id)) set_.add(id);
    const next = [...set_];
    set(key, next.length ? next : undefined);
  }

  const nameOf = {
    assignee: members.find((m) => m.userId === filter.assigneeId)?.name,
    epic: epics.find((e) => e.id === filter.epicId),
    sprint: sprints.find((s) => s.id === filter.sprintId)?.name,
  };

  // One list drives both the chip row and the active count, so a facet can
  // never be counted without being shown or shown without being counted.
  const chips: { key: string; label: string; value: string; clear: () => void }[] = [];
  if (filter.assigneeId) {
    chips.push({
      key: "assignee",
      label: "Assignee",
      value: nameOf.assignee ?? "Someone",
      clear: () => set("assigneeId", undefined),
    });
  }
  if (filter.type) {
    chips.push({
      key: "type",
      label: "Type",
      value: typeLabel(filter.type),
      clear: () => set("type", undefined),
    });
  }
  if (filter.priority) {
    chips.push({
      key: "priority",
      label: "Priority",
      value: priorityLabel(filter.priority),
      clear: () => set("priority", undefined),
    });
  }
  if (filter.epicId) {
    chips.push({
      key: "epic",
      label: "Epic",
      value: nameOf.epic ? nameOf.epic.key : "Epic",
      clear: () => set("epicId", undefined),
    });
  }
  if (filter.sprintId) {
    chips.push({
      key: "sprint",
      label: "Sprint",
      value: nameOf.sprint ?? "Sprint",
      clear: () => set("sprintId", undefined),
    });
  }
  for (const id of filter.labelIds ?? []) {
    chips.push({
      key: `label-${id}`,
      label: "Label",
      value: labels.find((l) => l.id === id)?.name ?? "Label",
      clear: () => toggleId("labelIds", id),
    });
  }
  for (const id of filter.componentIds ?? []) {
    chips.push({
      key: `component-${id}`,
      label: "Component",
      value: components.find((c) => c.id === id)?.name ?? "Component",
      clear: () => toggleId("componentIds", id),
    });
  }

  const anyActive = chips.length > 0 || Boolean(filter.search);

  return (
    <>
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <SearchInput
          value={filter.search ?? ""}
          onCommit={(v) => set("search", v || undefined)}
        />

        <FiltersButton count={chips.length} onClick={() => setPanelOpen(true)} />

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              value={chip.value}
              onRemove={chip.clear}
            />
          ))}
        </div>

        {anyActive && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange({})}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onClearAll={() => onChange({})}
        canClear={anyActive}
        description="Narrow what the board shows. Column counts follow the filter."
      >
        <FilterRow label="Assignee">
          <Picker
            label="Assignee"
            value={filter.assigneeId ?? ANY}
            onValueChange={(v) => set("assigneeId", v === ANY ? undefined : v)}
            options={[
              { value: ANY, label: "Anyone" },
              ...members.map((m) => ({ value: m.userId, label: m.name })),
            ]}
          />
        </FilterRow>

        <FilterRow label="Type">
          <Picker
            label="Type"
            value={filter.type ?? ANY}
            onValueChange={(v) =>
              set("type", v === ANY ? undefined : (v as IssueTypeDto))
            }
            options={[
              { value: ANY, label: "Any type" },
              ...TYPES.map((t) => ({ value: t, label: typeLabel(t) })),
            ]}
          />
        </FilterRow>

        <FilterRow label="Priority">
          <Picker
            label="Priority"
            value={filter.priority ?? ANY}
            onValueChange={(v) =>
              set("priority", v === ANY ? undefined : (v as IssuePriorityDto))
            }
            options={[
              { value: ANY, label: "Any priority" },
              ...PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) })),
            ]}
          />
        </FilterRow>

        {epics.length > 0 && (
          <FilterRow label="Epic">
            <Picker
              label="Epic"
              value={filter.epicId ?? ANY}
              onValueChange={(v) => set("epicId", v === ANY ? undefined : v)}
              options={[
                { value: ANY, label: "Any epic" },
                ...epics.map((e) => ({ value: e.id, label: `${e.key} · ${e.title}` })),
              ]}
            />
          </FilterRow>
        )}

        {/* A kanban project has no sprints, and an empty picker is worse than
            an absent one. */}
        {sprints.length > 0 && (
          <FilterRow label="Sprint">
            <Picker
              label="Sprint"
              value={filter.sprintId ?? ANY}
              onValueChange={(v) => set("sprintId", v === ANY ? undefined : v)}
              options={[
                { value: ANY, label: "Any sprint" },
                ...sprints.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </FilterRow>
        )}

        <FilterRow label="Labels">
          <FilterToggleGroup
            options={labels.map((l) => ({ id: l.id, label: l.name }))}
            selected={filter.labelIds ?? []}
            onToggle={(id) => toggleId("labelIds", id)}
            emptyLabel="No labels in this organisation yet"
          />
        </FilterRow>

        <FilterRow label="Components">
          <FilterToggleGroup
            options={components.map((c) => ({ id: c.id, label: c.name }))}
            selected={filter.componentIds ?? []}
            onToggle={(id) => toggleId("componentIds", id)}
            emptyLabel="No components in this project yet"
          />
        </FilterRow>
      </FilterPanel>
    </>
  );
}

/**
 * Debounced search.
 *
 * Local state with a commit-on-idle rather than writing every keystroke into
 * the filter: the board refetches on filter change, and typing "payment" would
 * otherwise be seven board loads.
 */
function SearchInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);

  // Follow the filter when it changes from outside (Clear, a chip removal).
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, value, onCommit]);

  return (
    <div className="relative w-56 shrink-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search cards…"
        className="pl-8"
        aria-label="Search board cards"
      />
    </div>
  );
}

function Picker({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
