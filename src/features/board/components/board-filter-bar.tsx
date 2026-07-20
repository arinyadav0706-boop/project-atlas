"use client";

import { X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  filter,
  onChange,
}: {
  members: { userId: string; name: string }[];
  filter: BoardFilter;
  onChange: (next: BoardFilter) => void;
}) {
  const active =
    filter.assigneeId !== undefined ||
    filter.type !== undefined ||
    filter.priority !== undefined;

  // `Select` has no empty value, so "Any" maps to removing the key entirely.
  const ANY = "__any__";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
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
