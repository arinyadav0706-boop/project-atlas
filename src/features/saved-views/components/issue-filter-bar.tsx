"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { isIssueFilterActive } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// The cross-project filter controls.
//
// `ALL` is a sentinel rather than an empty string because Radix Select forbids
// an empty item value; the mapping back to `undefined` happens here so the
// filter object never carries it.
const ALL = "__all__";
const OPEN = "__open__";

export interface ProjectOption {
  id: string;
  key: string;
  name: string;
}

/** Estimate coverage as one control: any / estimated / unestimated (UI-6). */
const ESTIMATE_OPTIONS = [
  { value: ALL, label: "Any estimate" },
  { value: "true", label: "Estimated" },
  { value: "false", label: "No estimate" },
] as const;

export function IssueFilterBar({
  filter,
  projects,
  currentUserId,
  onChange,
}: {
  filter: IssueFilter;
  projects: ProjectOption[];
  currentUserId: string;
  onChange: (next: IssueFilter) => void;
}) {
  // Every control writes through this, so "changing a filter" is one code path
  // and an empty value always becomes an absent key rather than a stored blank.
  function set<K extends keyof IssueFilter>(key: K, value: IssueFilter[K] | undefined) {
    const next = { ...filter };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const mineOnly = filter.assigneeId === currentUserId;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.search ?? ""}
          onChange={(e) => set("search", e.target.value.trim() ? e.target.value : undefined)}
          placeholder="Search titles…"
          className="pl-8"
          aria-label="Search issue titles"
        />
      </div>

      <Picker
        label="Project"
        value={filter.projectIds?.[0] ?? ALL}
        onValueChange={(v) => set("projectIds", v === ALL ? undefined : [v])}
        options={[
          { value: ALL, label: "All projects" },
          ...projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
        ]}
        className="w-full sm:w-56"
      />

      {/* One control writes two mutually exclusive fields: "Open" is
          `openOnly`, a named status is `status`. They are never both set, so
          the precedence rule in the where-builder is a safety net rather than
          something the UI relies on. */}
      <Picker
        label="Status"
        value={filter.status ?? (filter.openOnly ? OPEN : ALL)}
        onValueChange={(v) => {
          const next = { ...filter };
          delete next.status;
          delete next.openOnly;
          if (v === OPEN) next.openOnly = true;
          else if (v !== ALL) next.status = v as NonNullable<IssueFilter["status"]>;
          onChange(next);
        }}
        options={[
          { value: ALL, label: "Any status" },
          { value: OPEN, label: "Open (not done)" },
          { value: "TODO", label: "To Do" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "IN_REVIEW", label: "In Review" },
          { value: "DONE", label: "Done" },
        ]}
      />

      <Picker
        label="Type"
        value={filter.type ?? ALL}
        onValueChange={(v) =>
          set("type", v === ALL ? undefined : (v as NonNullable<IssueFilter["type"]>))
        }
        options={[
          { value: ALL, label: "Any type" },
          { value: "EPIC", label: "Epic" },
          { value: "STORY", label: "Story" },
          { value: "TASK", label: "Task" },
          { value: "BUG", label: "Bug" },
        ]}
      />

      <Picker
        label="Priority"
        value={filter.priority ?? ALL}
        onValueChange={(v) =>
          set("priority", v === ALL ? undefined : (v as NonNullable<IssueFilter["priority"]>))
        }
        options={[
          { value: ALL, label: "Any priority" },
          { value: "HIGHEST", label: "Highest" },
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
          { value: "LOWEST", label: "Lowest" },
        ]}
      />

      <Picker
        label="Estimate"
        value={filter.hasEstimate === undefined ? ALL : String(filter.hasEstimate)}
        onValueChange={(v) => set("hasEstimate", v === ALL ? undefined : v === "true")}
        options={[...ESTIMATE_OPTIONS]}
      />

      {/* A toggle rather than a people picker: "mine" is the overwhelmingly
          common case and needs no org-wide user list to answer. A full
          assignee filter arrives with the people selector it requires. */}
      <button
        type="button"
        onClick={() => set("assigneeId", mineOnly ? undefined : currentUserId)}
        aria-pressed={mineOnly}
        className={cn(
          "h-9 rounded-xl border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          mineOnly
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border bg-background text-muted-foreground shadow-card hover:text-foreground",
        )}
      >
        Assigned to me
      </button>

      {isIssueFilterActive(filter) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
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
      <SelectTrigger aria-label={label} className={cn("w-auto min-w-[9rem]", className)}>
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
