"use client";

import { useState } from "react";
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
import {
  FilterChip,
  FilterPanel,
  FilterRow,
  FiltersButton,
} from "@/shared/components/data/filter-bar";
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
/** Jira's `type != Sub-task`, as an option in the type list rather than a
 *  second control (ADR-0045 §6). */
const NO_SUBTASKS = "__no_subtasks__";

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

/**
 * One filter facet, as data rather than JSX.
 *
 * The same seven facets render three ways — inline controls, rows in the filter
 * panel, and removable chips — and describing them once is what keeps those
 * three in step. Every previous version of this file rendered them as literal
 * JSX, which is why the toolbar could not offer a chip summary without
 * duplicating each control's option list.
 */
interface Facet {
  id: string;
  /** Accessible name of the control, and the chip's prefix. */
  label: string;
  /** Current value; `ALL` means "not filtering on this". */
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  /** Inline width, for `wrap` layout only. */
  className?: string;
}

export function IssueFilterBar({
  layout = "wrap",
  filter,
  projects,
  currentUserId,
  onChange,
  children,
}: {
  /**
   * `row` is the fixed-height toolbar on /issues: a search box, a Filters
   * button, and a chip per active facet. `wrap` is the original all-controls
   * -inline bar, still used by timeline, calendar and the widget dialog, where
   * the container is narrow and wrapping is the right answer.
   *
   * The split exists because eight dropdowns do not fit in a toolbar at ANY
   * width — measured at 1920 the row still overflowed, clipping "Assigned to
   * me" and pushing "Clear" off-screen entirely. Jira, ClickUp and Linear all
   * answer this the same way: one Filters control, and chips for what is on.
   */
  layout?: "wrap" | "row";
  filter: IssueFilter;
  projects: ProjectOption[];
  currentUserId: string;
  onChange: (next: IssueFilter) => void;
  /** Extra controls for the filter panel — custom-field predicates on /issues. */
  children?: React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  // Every control writes through this, so "changing a filter" is one code path
  // and an empty value always becomes an absent key rather than a stored blank.
  function set<K extends keyof IssueFilter>(key: K, value: IssueFilter[K] | undefined) {
    const next = { ...filter };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const mineOnly = filter.assigneeId === currentUserId;

  const facets: Facet[] = [
    {
      id: "project",
      label: "Project",
      value: filter.projectIds?.[0] ?? ALL,
      onValueChange: (v) => set("projectIds", v === ALL ? undefined : [v]),
      options: [
        { value: ALL, label: "All projects" },
        ...projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
      ],
      className: "w-full sm:w-56",
    },
    {
      // One control writes two mutually exclusive fields: "Open" is `openOnly`,
      // a named status is `status`. They are never both set, so the precedence
      // rule in the where-builder is a safety net rather than something the UI
      // relies on.
      id: "status",
      label: "Status",
      value: filter.status ?? (filter.openOnly ? OPEN : ALL),
      onValueChange: (v) => {
        const next = { ...filter };
        delete next.status;
        delete next.openOnly;
        if (v === OPEN) next.openOnly = true;
        else if (v !== ALL) next.status = v as NonNullable<IssueFilter["status"]>;
        onChange(next);
      },
      options: [
        { value: ALL, label: "Any status" },
        { value: OPEN, label: "Open (not done)" },
        { value: "TODO", label: "To Do" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "IN_REVIEW", label: "In Review" },
        { value: "DONE", label: "Done" },
      ],
    },
    {
      // Type and subtask participation are ONE control (ADR-0045 §6), because
      // they are one question — "what kind of thing am I looking at?" — and two
      // dropdowns would let someone ask for `type=BUG, subtask=only`, which is
      // empty for a reason no reader could see.
      id: "type",
      label: "Type",
      value:
        filter.type ??
        (filter.subtask === "only"
          ? "SUBTASK"
          : filter.subtask === "exclude"
            ? NO_SUBTASKS
            : ALL),
      onValueChange: (v) => {
        const next = { ...filter };
        delete next.type;
        delete next.subtask;
        if (v === NO_SUBTASKS) next.subtask = "exclude";
        else if (v === "SUBTASK") next.subtask = "only";
        else if (v !== ALL) next.type = v as NonNullable<IssueFilter["type"]>;
        onChange(next);
      },
      options: [
        { value: ALL, label: "Any type" },
        { value: NO_SUBTASKS, label: "Everything but subtasks" },
        { value: "EPIC", label: "Epic" },
        { value: "STORY", label: "Story" },
        { value: "TASK", label: "Task" },
        { value: "BUG", label: "Bug" },
        { value: "SUBTASK", label: "Subtask" },
      ],
    },
    {
      id: "priority",
      label: "Priority",
      value: filter.priority ?? ALL,
      onValueChange: (v) =>
        set("priority", v === ALL ? undefined : (v as NonNullable<IssueFilter["priority"]>)),
      options: [
        { value: ALL, label: "Any priority" },
        { value: "HIGHEST", label: "Highest" },
        { value: "HIGH", label: "High" },
        { value: "MEDIUM", label: "Medium" },
        { value: "LOW", label: "Low" },
        { value: "LOWEST", label: "Lowest" },
      ],
    },
    {
      // "What is my team waiting on" — the question dependencies exist to
      // answer (ADR-0046 §7).
      id: "blocked",
      label: "Blocked",
      value: filter.blocked === undefined ? ALL : String(filter.blocked),
      onValueChange: (v) => set("blocked", v === ALL ? undefined : v === "true"),
      options: [
        { value: ALL, label: "Blocked or not" },
        { value: "true", label: "Blocked" },
        { value: "false", label: "Not blocked" },
      ],
    },
    {
      id: "estimate",
      label: "Estimate",
      value: filter.hasEstimate === undefined ? ALL : String(filter.hasEstimate),
      onValueChange: (v) => set("hasEstimate", v === ALL ? undefined : v === "true"),
      options: ESTIMATE_OPTIONS,
    },
  ];

  const searchBox = (
    <div className={cn("relative", layout === "row" ? "w-56 shrink-0" : "w-full sm:w-64")}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={filter.search ?? ""}
        onChange={(e) => set("search", e.target.value.trim() ? e.target.value : undefined)}
        placeholder="Search titles…"
        className="pl-8"
        aria-label="Search issue titles"
      />
    </div>
  );

  // A toggle rather than a people picker: "mine" is the overwhelmingly common
  // case and needs no org-wide user list to answer. A full assignee filter
  // arrives with the people selector it requires.
  const mineToggle = (
    <button
      type="button"
      onClick={() => set("assigneeId", mineOnly ? undefined : currentUserId)}
      aria-pressed={mineOnly}
      className={cn(
        "h-9 shrink-0 rounded-xl border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        mineOnly
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-muted-foreground shadow-card hover:text-foreground",
      )}
    >
      Assigned to me
    </button>
  );

  const clearButton = isIssueFilterActive(filter) ? (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange({})}>
      <X className="h-3.5 w-3.5" />
      Clear
    </Button>
  ) : null;

  if (layout === "wrap") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {searchBox}
        {facets.map((facet) => (
          <Picker key={facet.id} {...facet} />
        ))}
        {mineToggle}
        {children}
        {clearButton}
      </div>
    );
  }

  const activeFacets = facets.filter((f) => f.value !== ALL);
  // Custom-field predicates live in `children` and carry their own chips, so
  // they are counted but not chipped twice.
  const activeCount =
    activeFacets.length + (mineOnly ? 1 : 0) + (filter.customFields?.length ?? 0);

  return (
    <>
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        {searchBox}

        <FiltersButton count={activeCount} onClick={() => setPanelOpen(true)} />

        {/* What is actually on, spelled out. A count alone tells you a filter
            exists; the chips tell you which one is hiding the issue you came
            looking for — the failure mode of every "Filters (3)" button that
            does not do this. */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {activeFacets.map((facet) => (
            <FilterChip
              key={facet.id}
              label={facet.label}
              value={facet.options.find((o) => o.value === facet.value)?.label ?? facet.value}
              onRemove={() => facet.onValueChange(ALL)}
            />
          ))}
          {mineOnly && (
            <FilterChip label="Assignee" value="Me" onRemove={() => set("assigneeId", undefined)} />
          )}
        </div>

        {clearButton}
      </div>

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onClearAll={() => onChange({})}
        canClear={isIssueFilterActive(filter)}
      >
        {facets.map((facet) => (
          <FilterRow key={facet.id} label={facet.label}>
            <Picker {...facet} className="w-full" />
          </FilterRow>
        ))}

        <FilterRow label="Assignee">{mineToggle}</FilterRow>

        {children && <div className="border-t border-border-subtle pt-3">{children}</div>}
      </FilterPanel>
    </>
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
  options: readonly { value: string; label: string }[];
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
