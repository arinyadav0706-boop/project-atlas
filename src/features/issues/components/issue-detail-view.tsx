"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, GitBranch, Pencil, Trash2 } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  priorityLabel,
  statusLabel,
} from "./issue-meta";
import { EditIssueDialog } from "./edit-issue-dialog";
import { IssueDescription } from "./issue-description";
import { SubtaskPanel } from "./subtask-panel";
import { ConvertIssueDialog } from "./convert-issue-dialog";
import type {
  IssueDetailDto,
  IssueStatusDto,
} from "@/features/issues/types/issue.types";

export function IssueDetailView({
  projectId,
  issue,
  members,
}: {
  projectId: string;
  issue: IssueDetailDto;
  members: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function changeStatus(to: IssueStatusDto) {
    if (to === issue.status) return;
    setTransitioning(true);
    try {
      await apiRequest<IssueDetailDto>(`/api/issues/${issue.id}/transition`, {
        method: "POST",
        body: { status: to, expectedVersion: issue.version },
      });
      toast.success(`Moved to ${statusLabel(to)}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status.");
    } finally {
      setTransitioning(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await apiRequest(`/api/issues/${issue.id}`, { method: "DELETE" });
      toast.success(`${issue.key} deleted`);
      router.push(`/projects/${projectId}/issues`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the issue.");
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="grid gap-8 lg:grid-cols-[1fr_260px]"
    >
      <div className="min-w-0 space-y-5">
        {/* Title and description on one sheet. They were bare on the page; with
            the canvas tinted that left the most important text in the app
            sitting on grey with nothing behind it. */}
        <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
          {/* A subtask is never a page you land on with no idea what it belongs
              to (26_subtasks §5) — the parent comes first, above the key. */}
          {issue.parent && (
            <Link
              href={`/projects/${projectId}/issues/${issue.parent.id}`}
              className="mb-2 inline-flex max-w-full items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:underline"
            >
              <IssueTypeIcon type={issue.parent.type} className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px]">{issue.parent.key}</span>
              <span className="min-w-0 truncate">{issue.parent.title}</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
            </Link>
          )}
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <IssueTypeIcon type={issue.type} />
            <span className="font-mono text-xs">{issue.key}</span>
          </div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {issue.title}
          </h1>

          {/* Edited in place, not only through the rail's Edit dialog — an
              empty description that reads "No description." with no control
              beside it looks like a dead end rather than an invitation. */}
          <div className="mt-5">
            <IssueDescription issue={issue} />
          </div>
        </div>

        <HierarchySection projectId={projectId} issue={issue} />

        {/* Offered on every type that CAN parent one, even with none yet — the
            panel is how you discover you can break work down. Hiding it until
            a subtask exists would make the feature undiscoverable. */}
        {issue.canHaveSubtasks && (
          <SubtaskPanel
            projectId={projectId}
            parentId={issue.id}
            parentKey={issue.key}
            members={members}
            subtasks={issue.subtasks}
            progress={issue.subtaskProgress}
            canEdit={issue.canEdit}
          />
        )}
      </div>

      {/* One sheet for the whole metadata rail, with hairline rules between
          fields — six separate floating labels read as debris, not a panel. */}
      <aside className="h-fit space-y-4 rounded-2xl border border-border bg-background p-5 shadow-card">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </h2>
          {issue.canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  loading={transitioning}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <StatusDot status={issue.status} />
                    {statusLabel(issue.status)}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[220px]">
                {issue.allowedStatuses.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onSelect={() => changeStatus(s)}
                    className="flex items-center gap-2"
                  >
                    <StatusDot status={s} />
                    {statusLabel(s)}
                    {s === issue.status && (
                      <Check className="ml-auto h-4 w-4 text-accent" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-foreground">
              <StatusDot status={issue.status} />
              {statusLabel(issue.status)}
            </span>
          )}
        </div>

        <Field label="Assignee">
          {issue.assignee ? (
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Avatar className="h-6 w-6">
                <AvatarImage src={issue.assignee.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">
                  {initials(issue.assignee.name)}
                </AvatarFallback>
              </Avatar>
              {issue.assignee.name}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          )}
        </Field>

        <Field label="Reporter">
          {issue.reporter ? (
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Avatar className="h-6 w-6">
                <AvatarImage src={issue.reporter.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">
                  {initials(issue.reporter.name)}
                </AvatarFallback>
              </Avatar>
              {issue.reporter.name}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </Field>

        <Field label="Priority">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <PriorityIcon priority={issue.priority} />
            {priorityLabel(issue.priority)}
          </span>
        </Field>

        {issue.storyPoints != null && (
          <Field label="Story points">
            <span className="text-sm text-foreground">{issue.storyPoints}</span>
          </Field>
        )}

        <Field label="Created">
          <span className="text-sm text-foreground">{formatDate(issue.createdAt)}</span>
        </Field>

        {(issue.canEdit || issue.canDelete) && (
          <div className="flex flex-col gap-2 border-t border-border pt-5">
            {issue.canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" />
                Edit issue
              </Button>
            )}
            {/* Offered on anything that can move between the two levels — a
                subtask promoting out, or a Story/Task/Bug moving under a
                parent. Never on an Epic, which is neither (BR-10). */}
            {issue.canEdit && (issue.type === "SUBTASK" || issue.canHaveSubtasks) && (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => setConverting(true)}
              >
                <GitBranch className="h-4 w-4" />
                {issue.type === "SUBTASK" ? "Convert to issue" : "Convert to subtask"}
              </Button>
            )}
            {issue.canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        )}
      </aside>

      {issue.canEdit && (
        <EditIssueDialog
          issue={issue}
          members={members}
          open={editing}
          onOpenChange={setEditing}
        />
      )}

      {issue.canEdit && (
        <ConvertIssueDialog issue={issue} open={converting} onOpenChange={setConverting} />
      )}

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete {issue.key}?</DialogTitle>
          <DialogDescription>
            This removes the issue from the project. This can&apos;t be undone from
            here.
            {/* BR-8: subtasks go with the parent. Saying so before the click,
                not discovering it after — this is the one delete in the app
                that takes other rows with it. */}
            {issue.subtasks.length > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  Its {issue.subtasks.length}{" "}
                  {issue.subtasks.length === 1 ? "subtask" : "subtasks"} will be
                  deleted too.
                </span>
              </>
            )}
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" loading={deleting} onClick={onDelete}>
              Delete issue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// Hierarchy (ADR-0026): a child shows its parent epic; an epic shows its child
// issues. Rendered only when there's something to show, so it stays quiet.
function HierarchySection({
  projectId,
  issue,
}: {
  projectId: string;
  issue: IssueDetailDto;
}) {
  const isEpic = issue.type === "EPIC";
  if (!isEpic && !issue.epic) return null;

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isEpic ? "Child issues" : "Parent epic"}
      </h2>

      {!isEpic && issue.epic && (
        <Link
          href={`/projects/${projectId}/issues/${issue.epic.id}`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
        >
          <IssueTypeIcon type="EPIC" />
          <span className="font-mono text-xs text-muted-foreground">{issue.epic.key}</span>
          <span className="min-w-0 flex-1 truncate text-foreground">{issue.epic.title}</span>
        </Link>
      )}

      {isEpic &&
        (issue.children.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No child issues yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border">
            {issue.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/projects/${projectId}/issues/${child.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <IssueTypeIcon type={child.type} />
                  <span className="font-mono text-xs text-muted-foreground">{child.key}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{child.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusDot status={child.status} />
                    {statusLabel(child.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      {children}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
