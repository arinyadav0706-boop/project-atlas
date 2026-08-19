"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { priorityLabel } from "@/features/issues/components/issue-meta";
import type { IssuePriorityDto } from "@/features/issues/types/issue.types";

// The full subtask form (26_subtasks.md §5).
//
// The panel's one-line field stays, because breaking work down happens while
// reading the parent and a modal per line would stop people doing it. But a
// title is not always the whole thought: "Write the migration" often needs the
// paragraph explaining WHICH migration, and an owner. Quick-add alone left the
// only route to that a second trip through the Edit dialog, which is not a
// route anybody finds.
//
// So: both. Type and enter for speed, "More options" when the subtask deserves
// a sentence. Story points and Epic are absent by rule, not by omission —
// a subtask cannot carry points (BR-6) and takes its epic from its parent
// (BR-3).

const PRIORITIES: IssuePriorityDto[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];
const UNASSIGNED = "__unassigned__";

export function CreateSubtaskDialog({
  parentId,
  parentKey,
  members,
  open,
  onOpenChange,
  /** Carried over from the inline field, so switching to the full form keeps
   *  whatever was already typed. */
  initialTitle = "",
  onCreated,
}: {
  parentId: string;
  parentKey: string;
  members: { userId: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle?: string;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriorityDto>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);
  const [estimateHours, setEstimateHours] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Seeded each time it opens, so a cancelled attempt does not reappear.
  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setDescription("");
    setPriority("MEDIUM");
    setAssigneeId(UNASSIGNED);
    setEstimateHours("");
  }, [open, initialTitle]);

  const trimmed = title.trim();

  async function submit() {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      // Hours in the form, minutes on the wire — nobody plans in minutes, and
      // the column is minutes because that is what work logs are.
      const hours = Number(estimateHours);
      const estimateMinutes =
        estimateHours.trim() && Number.isFinite(hours) && hours >= 0
          ? Math.round(hours * 60)
          : undefined;

      await apiRequest(`/api/issues/${parentId}/subtasks`, {
        method: "POST",
        body: {
          title: trimmed,
          ...(description.trim() ? { description: description.trim() } : {}),
          priority,
          assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
          ...(estimateMinutes !== undefined ? { estimateMinutes } : {}),
        },
      });
      onOpenChange(false);
      onCreated?.();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the subtask.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Add a subtask</DialogTitle>
        <DialogDescription>
          It becomes a full issue with its own key under {parentKey} — assignable
          to anyone on the project, and it follows {parentKey} into whatever
          sprint it is in.
        </DialogDescription>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="subtask-title">Title</Label>
            <Input
              id="subtask-title"
              value={title}
              autoFocus
              maxLength={200}
              placeholder="Write the migration"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>

          <div>
            <Label htmlFor="subtask-description">
              Description <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="subtask-description"
              value={description}
              rows={5}
              maxLength={20000}
              placeholder="Which migration, and what does done look like?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="subtask-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as IssuePriorityDto)}
              >
                <SelectTrigger id="subtask-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subtask-assignee">Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="subtask-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subtask-estimate">
                Estimate <span className="font-normal">(hours)</span>
              </Label>
              <Input
                id="subtask-estimate"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                placeholder="—"
                value={estimateHours}
                onChange={(e) => setEstimateHours(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!trimmed}>
            Add subtask
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
