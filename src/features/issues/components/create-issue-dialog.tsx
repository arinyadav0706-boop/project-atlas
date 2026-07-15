"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  createIssueSchema,
  type CreateIssueInput,
} from "@/features/issues/validation/issue.schemas";
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
import { typeLabel, priorityLabel } from "./issue-meta";
import type { IssueDetailDto } from "@/features/issues/types/issue.types";

const TYPES = ["TASK", "STORY", "BUG", "EPIC"] as const;
const PRIORITIES = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;

export function CreateIssueDialog({
  projectId,
  members,
  withHotkey = false,
}: {
  projectId: string;
  members: { userId: string; name: string }[];
  withHotkey?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateIssueInput>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: { type: "TASK", title: "", description: "", priority: "MEDIUM" },
  });

  useEffect(() => {
    if (!withHotkey) return;
    function onKeyDown(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable;
      if (event.key.toLowerCase() === "c" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [withHotkey]);

  async function onSubmit(input: CreateIssueInput) {
    setSubmitting(true);
    try {
      const issue = await apiRequest<IssueDetailDto>(
        `/api/projects/${projectId}/issues`,
        {
          method: "POST",
          body: {
            ...input,
            assigneeId: input.assigneeId || null,
            description: input.description || undefined,
          },
        },
      );
      toast.success(`${issue.key} created`);
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the issue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New issue
          {withHotkey && (
            <kbd className="ml-1 hidden rounded border border-white/25 px-1 text-[10px] font-normal opacity-75 sm:inline-block">
              C
            </kbd>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>New issue</DialogTitle>
        <DialogDescription>Add a unit of work to this project.</DialogDescription>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              autoFocus
              placeholder="Short, action-oriented summary"
              aria-invalid={Boolean(form.formState.errors.title)}
              {...form.register("title")}
            />
            {form.formState.errors.title && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="issue-type">Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as CreateIssueInput["type"])}
              >
                <SelectTrigger id="issue-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {typeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="issue-priority">Priority</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(v) =>
                  form.setValue("priority", v as CreateIssueInput["priority"])
                }
              >
                <SelectTrigger id="issue-priority" className="w-full">
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
              <Label htmlFor="issue-assignee">Assignee</Label>
              <Select
                value={form.watch("assigneeId") ?? "unassigned"}
                onValueChange={(v) =>
                  form.setValue("assigneeId", v === "unassigned" ? null : v)
                }
              >
                <SelectTrigger id="issue-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="issue-description">
              Description <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="issue-description"
              placeholder="Add more detail…"
              {...form.register("description")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create issue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
