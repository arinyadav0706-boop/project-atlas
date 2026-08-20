"use client";

import { useState } from "react";
import { CalendarPlus, Inbox } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { addDays, startOfDay, toDayString } from "@/features/timeline/lib/scale";
import type { TimelineRowDto } from "@/features/timeline/types/timeline.types";

// Undated issues, and the fastest route onto the chart (BR-12).
//
// Date inputs and a button rather than drag-and-drop from the tray onto a
// horizontally-scrolling axis. That gesture is the flashy one, but it is also
// the one that needs auto-scroll at the edges, a drop preview, and a keyboard
// equivalent built separately — and none of that makes it faster than typing a
// date. This is keyboard-operable for free and testable without a browser.
// Drag-from-tray is tracked as a refinement (backlog TL-3), not pretended.

export function UnscheduledTray({
  items,
  canEdit,
  onScheduled,
}: {
  items: TimelineRowDto[];
  canEdit: boolean;
  onScheduled: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={<Inbox />}
        title={`Unscheduled (${items.length})`}
        action={
          <span className="text-[11px] text-muted-foreground">
            No due date, so nothing to draw yet
          </span>
        }
      />
      <ul className="divide-y divide-border/60 px-2 pb-2">
        {items.map((item) => (
          <TrayRow key={item.id} item={item} canEdit={canEdit} onScheduled={onScheduled} />
        ))}
      </ul>
    </Card>
  );
}

function TrayRow({
  item,
  canEdit,
  onScheduled,
}: {
  item: TimelineRowDto;
  canEdit: boolean;
  onScheduled: () => void;
}) {
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function schedule(startDate: string | null, dueDate: string) {
    setSaving(true);
    try {
      await apiRequest(`/api/issues/${item.id}/schedule`, {
        method: "PATCH",
        body: { startDate, dueDate, expectedVersion: item.version },
      });
      onScheduled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't schedule that.");
    } finally {
      setSaving(false);
    }
  }

  /** The common case in one click: starts today, due Friday-ish. */
  function thisWeek() {
    const today = startOfDay(new Date());
    void schedule(toDayString(today), toDayString(addDays(today, 6)));
  }

  const valid = due !== "" && (start === "" || start <= due);

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <IssueTypeIcon type={item.type} className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.key}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
        {item.title}
      </span>

      {canEdit && (
        <>
          <Input
            type="date"
            value={start}
            aria-label={`Start date for ${item.key}`}
            className="h-8 w-[9.5rem] text-[12px]"
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            type="date"
            value={due}
            aria-label={`Due date for ${item.key}`}
            className="h-8 w-[9.5rem] text-[12px]"
            onChange={(e) => setDue(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={() => schedule(start || null, due)}
          >
            Schedule
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={thisWeek}>
            <CalendarPlus className="h-3.5 w-3.5" />
            This week
          </Button>
        </>
      )}
    </li>
  );
}
