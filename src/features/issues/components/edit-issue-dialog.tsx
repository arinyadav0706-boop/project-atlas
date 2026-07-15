"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  updateIssueSchema,
  type UpdateIssueInput,
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

export function EditIssueDialog({
  issue,
  members,
  open,
  onOpenChange,
}: {
  issue: IssueDetailDto;
  members: { userId: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<UpdateIssueInput>({
    resolver: zodResolver(updateIssueSchema),
    defaultValues: {
      title: issue.title,
      description: issue.description ?? "",
      type: issue.type,
      priority: issue.priority,
      assigneeId: issue.assignee?.id ?? null,
    },
  });

  async function onSubmit(input: UpdateIssueInput) {
    setSubmitting(true);
    try {
      await apiRequest<IssueDetailDto>(`/api/issues/${issue.id}`, {
        method: "PATCH",
        body: {
          ...input,
          description: input.description?.trim() ? input.description : null,
          assigneeId: input.assigneeId || null,
        },
      });
      toast.success("Issue updated");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the issue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit issue</DialogTitle>
        <DialogDescription>Update the details of {issue.key}.</DialogDescription>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              autoFocus
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
              <Label htmlFor="edit-type">Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as UpdateIssueInput["type"])}
              >
                <SelectTrigger id="edit-type" className="w-full">
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
              <Label htmlFor="edit-priority">Priority</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(v) =>
                  form.setValue("priority", v as UpdateIssueInput["priority"])
                }
              >
                <SelectTrigger id="edit-priority" className="w-full">
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
              <Label htmlFor="edit-assignee">Assignee</Label>
              <Select
                value={form.watch("assigneeId") ?? "unassigned"}
                onValueChange={(v) =>
                  form.setValue("assigneeId", v === "unassigned" ? null : v)
                }
              >
                <SelectTrigger id="edit-assignee" className="w-full">
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
            <Label htmlFor="edit-description">
              Description <span className="font-normal">(optional)</span>
            </Label>
            <Textarea id="edit-description" {...form.register("description")} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
