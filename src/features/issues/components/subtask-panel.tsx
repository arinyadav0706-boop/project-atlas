"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, GitBranch, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { StatusSwatch } from "@/features/workflow/components/status-swatch";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import { StatusDot, statusLabel } from "@/features/issues/components/issue-meta";
import { MAX_SUBTASKS_PER_PARENT } from "@/features/issues/validation/issue.schemas";
import { CreateSubtaskDialog } from "@/features/issues/components/create-subtask-dialog";
import type {
  SubtaskDto,
  SubtaskProgressDto,
} from "@/features/issues/types/issue.types";

// The Subtasks panel on a parent's detail page (26_subtasks.md §5).
//
// Breaking work down happens while you are reading the parent, so adding one is
// a single inline field, not a modal — a dialog for one text input is exactly
// the friction that stops people doing it at all. Each row's status is editable
// in place for the same reason.

export function SubtaskPanel({
  projectId,
  parentId,
  parentKey,
  members,
  statuses,
  subtasks,
  progress,
  canEdit,
}: {
  projectId: string;
  parentId: string;
  parentKey: string;
  members: { userId: string; name: string }[];
  /**
   * The project's statuses. A subtask lives in the same project as its parent,
   * so the parent's list is exactly the right one — no per-row fetch.
   */
  statuses: WorkflowStatusDto[];
  subtasks: SubtaskDto[];
  progress: SubtaskProgressDto;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [fullFormOpen, setFullFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const atCap = subtasks.length >= MAX_SUBTASKS_PER_PARENT;

  async function add() {
    const trimmed = title.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await apiRequest(`/api/issues/${parentId}/subtasks`, {
        method: "POST",
        body: { title: trimmed },
      });
      setTitle("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the subtask.");
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(subtask: SubtaskDto, to: WorkflowStatusDto) {
    if (to.id === subtask.workflowStatus.id) return;
    setBusyId(subtask.id);
    try {
      await apiRequest(`/api/issues/${subtask.id}/transition`, {
        method: "POST",
        body: { statusId: to.id, expectedVersion: subtask.version },
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the status.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          Subtasks
        </h2>
        {progress.total > 0 && (
          <>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {progress.done} of {progress.total} done
            </span>
            {/* Minutes roll up, points never do (BR-6/BR-11) — a 5-point story
                split into a 3 and a 2 would make velocity read 10. */}
            {progress.estimateMinutes !== null && (
              <span className="text-[12px] tabular-nums text-muted-foreground">
                · {formatHours(progress.estimateMinutes)} estimated in total
              </span>
            )}
            <ProgressBar done={progress.done} total={progress.total} />
          </>
        )}
      </div>

      {subtasks.length > 0 && (
        <ul className="mb-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <Link
                href={`/projects/${projectId}/issues/${subtask.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm focus-visible:outline-none focus-visible:underline"
              >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {subtask.key}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-foreground",
                    // Struck through when done: at a glance the panel should
                    // read as a checklist, which is the one thing a lightweight
                    // subtask model gets right.
                    subtask.status === "DONE" && "text-muted-foreground line-through",
                  )}
                >
                  {subtask.title}
                </span>
              </Link>

              {subtask.assignee && (
                <Avatar className="h-5 w-5 shrink-0" title={subtask.assignee.name}>
                  {subtask.assignee.avatarUrl && (
                    <AvatarImage src={subtask.assignee.avatarUrl} alt="" />
                  )}
                  <AvatarFallback className="text-[9px]">
                    {subtask.assignee.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}

              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={busyId === subtask.id}
                      aria-label={`Status of ${subtask.key}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                    >
                      <StatusSwatch color={subtask.workflowStatus.color} />
                      {subtask.workflowStatus.name}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[180px]">
                    {statuses.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onSelect={() => setStatus(subtask, s)}
                        className="flex items-center gap-2"
                      >
                        <StatusSwatch color={s.color} />
                        {s.name}
                        {s.id === subtask.workflowStatus.id && (
                          <Check className="ml-auto h-3.5 w-3.5 text-accent" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
                  <StatusDot status={subtask.status} />
                  {statusLabel(subtask.status)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        atCap ? (
          <p className="text-[13px] text-muted-foreground">
            This issue has the maximum of {MAX_SUBTASKS_PER_PARENT} subtasks. Anything
            more belongs in its own issue.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={title}
              placeholder="Add a subtask…"
              maxLength={200}
              aria-label="New subtask title"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
            <Button
              size="sm"
              onClick={add}
              loading={adding}
              disabled={title.trim().length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
            {/* The full form, for when a title is not the whole thought —
                a description, an owner, an estimate. Whatever is already typed
                above carries into it, so switching costs nothing. */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFullFormOpen(true)}
              title="Add a subtask with a description, assignee and estimate"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More options
            </Button>
          </div>
        )
      ) : (
        subtasks.length === 0 && (
          <p className="text-sm italic text-muted-foreground">No subtasks.</p>
        )
      )}

      <CreateSubtaskDialog
        parentId={parentId}
        parentKey={parentKey}
        members={members}
        open={fullFormOpen}
        onOpenChange={setFullFormOpen}
        initialTitle={title}
        onCreated={() => setTitle("")}
      />
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className="ml-auto h-1.5 w-28 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${done} of ${total} subtasks done`}
    >
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Minutes as hours, because nobody plans in 480-minute units. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}
