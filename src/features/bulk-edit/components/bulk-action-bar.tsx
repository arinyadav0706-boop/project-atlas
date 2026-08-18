"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { BulkEditChanges } from "@/features/bulk-edit/validation/bulk-edit.schemas";

// The bulk action bar (23_bulk_edit.md §5).
//
// Sticky at the bottom so a selection made at the top of a long list is still
// actionable after scrolling — the alternative is scrolling back up to a
// toolbar you can no longer see, which is what makes bulk edit feel broken.
const NONE = "__none__";

// Labels are "Set …", not "Status"/"Priority": the filter bar above already
// owns those names, and two controls sharing an accessible name on one page is
// ambiguous to a screen reader (and to a test — which is how it was noticed).

/**
 * The v1 control set: status, priority, and assignee limited to me/unassigned.
 *
 * A full assignee picker needs a people list scoped to the selection, and a
 * sprint picker needs the sprints of whichever projects are selected — both
 * are meaningless for a cross-project selection until there is a control that
 * can express "per project". The API supports all four fields today; the UI
 * offers the three that can be answered unambiguously. Tracked in the module
 * doc's Future Scope rather than shipped as a picker that is wrong half the
 * time.
 */
export function BulkActionBar({
  count,
  currentUserId,
  applying,
  onApply,
  onClear,
}: {
  count: number;
  currentUserId: string;
  applying: boolean;
  onApply: (changes: BulkEditChanges) => void;
  onClear: () => void;
}) {
  const [status, setStatus] = useState<string>(NONE);
  const [priority, setPriority] = useState<string>(NONE);
  const [assignee, setAssignee] = useState<string>(NONE);

  const changes: BulkEditChanges = {
    ...(status !== NONE ? { status: status as BulkEditChanges["status"] } : {}),
    ...(priority !== NONE ? { priority: priority as BulkEditChanges["priority"] } : {}),
    ...(assignee !== NONE
      ? { assigneeId: assignee === "__unassigned__" ? null : currentUserId }
      : {}),
  };
  const hasChanges = Object.keys(changes).length > 0;

  function reset() {
    setStatus(NONE);
    setPriority(NONE);
    setAssignee(NONE);
  }

  return (
    <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-pop backdrop-blur">
      <span className="text-[13px] font-semibold text-foreground">
        {count} selected
      </span>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Field
        label="Set status"
        value={status}
        onChange={setStatus}
        options={[
          { value: NONE, label: "Status…" },
          { value: "TODO", label: "To Do" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "IN_REVIEW", label: "In Review" },
          { value: "DONE", label: "Done" },
        ]}
      />

      <Field
        label="Set priority"
        value={priority}
        onChange={setPriority}
        options={[
          { value: NONE, label: "Priority…" },
          { value: "HIGHEST", label: "Highest" },
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
          { value: "LOWEST", label: "Lowest" },
        ]}
      />

      <Field
        label="Set assignee"
        value={assignee}
        onChange={setAssignee}
        options={[
          { value: NONE, label: "Assignee…" },
          { value: "__me__", label: "Assign to me" },
          { value: "__unassigned__", label: "Unassign" },
        ]}
      />

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={applying}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button
          size="sm"
          disabled={!hasChanges || applying}
          onClick={() => {
            onApply(changes);
            reset();
          }}
        >
          {applying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Apply to {count}
        </Button>
      </div>
    </div>
  );
}

function Field({
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
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-[8.5rem] text-[13px]">
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
