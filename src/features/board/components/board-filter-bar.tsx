"use client";

import { useEffect, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { typeLabel, priorityLabel } from "@/features/issues/components/issue-meta";
import type { BoardFilter } from "@/features/board/types/board.types";
import type {
  IssuePriorityDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

const TYPES: IssueTypeDto[] = ["TASK", "STORY", "BUG", "EPIC"];
const PRIORITIES: IssuePriorityDto[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

// Renders the filters whose data exists in V1 (assignee, type, priority). The
// board reads the full composable BoardFilter (ADR-0008), so adding Sprint,
// Epic, Label, or Saved Filters later is a control here — no board redesign.
export function BoardFilterBar({
  members,
  labels,
  components,
  epics,
  sprints = [],
  filter,
  onChange,
}: {
  members: { userId: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  components: { id: string; name: string }[];
  epics: { id: string; key: string; title: string }[];
  // Sprints that can meaningfully scope a board: the running one and the
  // planned queue. Optional so a surface without sprints (a kanban project)
  // simply omits the control rather than rendering an empty one.
  sprints?: { id: string; name: string; status: string }[];
  filter: BoardFilter;
  onChange: (next: BoardFilter) => void;
}) {
  const active =
    filter.assigneeId !== undefined ||
    filter.type !== undefined ||
    filter.priority !== undefined ||
    filter.epicId !== undefined ||
    filter.sprintId !== undefined ||
    (filter.labelIds?.length ?? 0) > 0 ||
    (filter.componentIds?.length ?? 0) > 0;

  function toggleId(list: string[] | undefined, id: string): string[] | undefined {
    const set = new Set(list ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = [...set];
    return next.length ? next : undefined;
  }

  // `Select` has no empty value, so "Any" maps to removing the key entirely.
  const ANY = "__any__";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput
        value={filter.search ?? ""}
        onCommit={(v) => onChange({ ...filter, search: v || undefined })}
      />

      <Select
        value={filter.assigneeId ?? ANY}
        onValueChange={(v) =>
          onChange({ ...filter, assigneeId: v === ANY ? undefined : v })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-36 text-sm">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any assignee</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.type ?? ANY}
        onValueChange={(v) =>
          onChange({ ...filter, type: v === ANY ? undefined : (v as IssueTypeDto) })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-28 text-sm">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {typeLabel(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.priority ?? ANY}
        onValueChange={(v) =>
          onChange({
            ...filter,
            priority: v === ANY ? undefined : (v as IssuePriorityDto),
          })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-28 text-sm">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any priority</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {priorityLabel(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sprints.length > 0 && (
        <Select
          value={filter.sprintId ?? ANY}
          onValueChange={(v) =>
            onChange({ ...filter, sprintId: v === ANY ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 w-auto min-w-36 text-sm">
            <SelectValue placeholder="Sprint" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={ANY}>Any sprint</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.status === "ACTIVE" ? " · active" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {epics.length > 0 && (
        <Select
          value={filter.epicId ?? ANY}
          onValueChange={(v) =>
            onChange({ ...filter, epicId: v === ANY ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 w-auto min-w-36 text-sm">
            <SelectValue placeholder="Epic" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={ANY}>Any epic</SelectItem>
            {epics.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {components.length > 0 && (
        <MultiSelect
          label="Components"
          options={components.map((c) => ({ id: c.id, label: c.name }))}
          selected={filter.componentIds}
          onToggle={(id) =>
            onChange({ ...filter, componentIds: toggleId(filter.componentIds, id) })
          }
        />
      )}

      {labels.length > 0 && (
        <MultiSelect
          label="Labels"
          options={labels.map((l) => ({ id: l.id, label: l.name, color: l.color }))}
          selected={filter.labelIds}
          onToggle={(id) =>
            onChange({ ...filter, labelIds: toggleId(filter.labelIds, id) })
          }
        />
      )}

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          onClick={() => onChange({})}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

// A compact multi-select on DropdownMenu — items stay open on toggle. Used for
// the label + component filters (both are `?field=` repeated query params).
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: string[] | undefined;
  onToggle: (id: string) => void;
}) {
  const count = selected?.length ?? 0;
  const chosen = new Set(selected ?? []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-sm">
          {label}
          {count > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 text-xs text-accent">
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={(e) => {
              e.preventDefault();
              onToggle(option.id);
            }}
            className="gap-2 text-sm"
          >
            {option.color && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: option.color }}
              />
            )}
            <span className="flex-1 truncate">{option.label}</span>
            {chosen.has(option.id) && <span className="text-xs text-accent">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Free-text title filter. Debounced rather than fired per keystroke: every
// change is a server round trip (the list is keyset-paginated, so it cannot be
// filtered client-side), and a request per character would both hammer the API
// and race its own responses.
function SearchInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Re-sync when the filter is cleared from outside (the Clear button).
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onCommit(draft.trim()), 300);
    return () => clearTimeout(t);
  }, [draft, value, onCommit]);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // Enter commits immediately — waiting out the debounce after an
        // explicit submit feels broken.
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft.trim());
        }}
        placeholder="Search titles"
        aria-label="Search issue titles"
        className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </div>
  );
}
