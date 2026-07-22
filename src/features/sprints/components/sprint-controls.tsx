"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { SprintWithProgressDto } from "@/features/sprints/types/sprint.types";

// Sprint lifecycle actions (BR-2/BR-3/BR-4). LEAD-only; rendered by the planning
// view's header. Each action hits the API then calls `onChanged` so the page
// re-fetches (lifecycle changes are infrequent — a refresh keeps state honest).

// Datetime-local <input> wants "YYYY-MM-DDTHH:mm"; the API wants ISO. Convert
// both ways at the boundary.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateSprintButton({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest(`/api/projects/${projectId}/sprints`, {
        method: "POST",
        body: { name: name.trim(), goal: goal.trim() || undefined },
      });
      toast.success("Sprint created");
      setOpen(false);
      setName("");
      setGoal("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Create sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Create sprint</DialogTitle>
        <DialogDescription>
          Plan a cycle of work. Add issues from the backlog, then start it.
        </DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="sprint-name">Name</Label>
            <Input
              id="sprint-name"
              autoFocus
              placeholder="e.g. Sprint 12"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sprint-goal">
              Goal <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="sprint-goal"
              placeholder="What this sprint is trying to achieve"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Start requires start/end dates (BR-2); the modal collects/edits them, then
// PATCHes the dates (if changed) and calls start.
export function StartSprintButton({
  sprint,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toLocalInput(sprint.startDate));
  const [end, setEnd] = useState(toLocalInput(sprint.endDate));
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!start || !end) {
      toast.error("Set both a start and end date.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("End date must be after the start date.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        body: {
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
        },
      });
      await apiRequest(`/api/sprints/${sprint.id}/start`, { method: "POST" });
      toast.success("Sprint started");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Start sprint</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Start sprint</DialogTitle>
        <DialogDescription>
          Set the sprint dates. Only one sprint can be active per project.
        </DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="sprint-start">Start date</Label>
            <Input
              id="sprint-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sprint-end">End date</Label>
            <Input
              id="sprint-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting}>
              Start
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit name / goal / dates for a PLANNED or ACTIVE sprint.
export function EditSprintButton({
  sprint,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [start, setStart] = useState(toLocalInput(sprint.startDate));
  const [end, setEnd] = useState(toLocalInput(sprint.endDate));
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    if (start && end && new Date(end) <= new Date(start)) {
      toast.error("End date must be after the start date.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          goal: goal.trim() || null,
          startDate: start ? new Date(start).toISOString() : null,
          endDate: end ? new Date(end).toISOString() : null,
        },
      });
      toast.success("Sprint updated");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Edit sprint</DialogTitle>
        <DialogDescription>Update the sprint&apos;s name, goal, or dates.</DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="edit-sprint-name">Name</Label>
            <Input id="edit-sprint-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-sprint-goal">Goal</Label>
            <Textarea id="edit-sprint-goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-sprint-start">Start date</Label>
              <Input
                id="edit-sprint-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-sprint-end">End date</Label>
              <Input
                id="edit-sprint-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Delete a PLANNED/COMPLETED sprint (an ACTIVE one must be completed first).
// Issues in the sprint return to the backlog.
export function DeleteSprintButton({
  sprint,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiRequest(`/api/sprints/${sprint.id}`, { method: "DELETE" });
      toast.success("Sprint deleted");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Delete sprint</DialogTitle>
        <DialogDescription>
          {sprint.status === "COMPLETED"
            ? "This removes the completed sprint from the history. Its issues stay where they are."
            : "Any issues in this sprint return to the backlog. This can't be undone."}
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} loading={submitting}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Complete shows how many incomplete issues will move, and where — the backlog
// (default) or a chosen follow-up PLANNED sprint (BR-3).
export function CompleteSprintButton({
  sprint,
  targets,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  // Other PLANNED sprints the incomplete issues may move into.
  targets: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [destination, setDestination] = useState("backlog");
  const incomplete = sprint.progress.totalIssues - sprint.progress.doneIssues;

  async function submit() {
    setSubmitting(true);
    try {
      await apiRequest(`/api/sprints/${sprint.id}/complete`, {
        method: "POST",
        body: {
          moveIncompleteToSprintId: destination === "backlog" ? null : destination,
        },
      });
      toast.success("Sprint completed");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Complete sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Complete sprint</DialogTitle>
        <DialogDescription>
          {incomplete > 0
            ? `${incomplete} incomplete ${incomplete === 1 ? "issue" : "issues"} will move to:`
            : "All issues are done. This will close the sprint."}
        </DialogDescription>
        {incomplete > 0 && targets.length > 0 && (
          <div className="mt-4">
            <Label htmlFor="complete-destination">Move incomplete issues to</Label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger id="complete-destination" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
