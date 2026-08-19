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
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type {
  IssueDetailDto,
  IssueListItemDto,
} from "@/features/issues/types/issue.types";

// Convert an issue into a subtask, or a subtask back into an issue (BR-10).
//
// One dialog for both directions because they are the same PATCH — `parentId`
// set or cleared — and because what matters in each is the same sentence: what
// this will change that you did not ask it to. A conversion into a subtask
// clears the epic and the story points, and saying so afterwards is how people
// stop trusting a tool.

export function ConvertIssueDialog({
  issue,
  open,
  onOpenChange,
}: {
  issue: IssueDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const toSubtask = issue.type !== "SUBTASK";
  const [parentId, setParentId] = useState<string>("");
  const [candidates, setCandidates] = useState<IssueListItemDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Loaded when the dialog opens, not on mount: this is a whole project's issue
  // list, and the overwhelming majority of detail-page visits never convert.
  useEffect(() => {
    if (!open || !toSubtask || candidates) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await apiRequest<{ items: IssueListItemDto[] }>(
          `/api/projects/${issue.projectId}/issues?take=100`,
        );
        if (cancelled) return;
        // The server enforces the same rule (BR-2); this is so the picker never
        // offers something it will then refuse.
        setCandidates(
          page.items.filter(
            (i) => i.id !== issue.id && ["STORY", "TASK", "BUG"].includes(i.type),
          ),
        );
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toSubtask, candidates, issue.projectId, issue.id]);

  async function submit() {
    if (busy || (toSubtask && !parentId)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/issues/${issue.id}`, {
        method: "PATCH",
        body: {
          parentId: toSubtask ? parentId : null,
          expectedVersion: issue.version,
        },
      });
      toast.success(toSubtask ? "Converted to a subtask." : "Converted to an issue.");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't convert this issue.");
    } finally {
      setBusy(false);
    }
  }

  // Exactly what this will take away, listed before it happens.
  const losses = [
    issue.epicId ? "its parent epic" : null,
    issue.storyPoints != null ? `its ${issue.storyPoints} story points` : null,
  ].filter((s): s is string => s !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          {toSubtask ? `Convert ${issue.key} to a subtask` : `Convert ${issue.key} to an issue`}
        </DialogTitle>
        <DialogDescription>
          {toSubtask
            ? "It keeps its key, comments and history, and moves under the parent you choose — including into whatever sprint that parent is in."
            : "It becomes a standalone Task, leaves its parent, and appears in the backlog again."}
        </DialogDescription>

        {toSubtask && (
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="convert-parent">Parent</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="convert-parent">
                  <SelectValue
                    placeholder={candidates === null ? "Loading…" : "Choose a parent…"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(candidates ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.key} · {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates?.length === 0 && (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  This project has no Story, Task or Bug that could be a parent.
                </p>
              )}
            </div>

            {losses.length > 0 && (
              <p className="rounded-xl border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
                This will clear {losses.join(" and ")}. A subtask takes its epic from
                its parent, and estimation happens on the parent, not the pieces.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={toSubtask && !parentId}>
            Convert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
