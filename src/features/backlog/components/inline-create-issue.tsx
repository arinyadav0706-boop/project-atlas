"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import type { IssueDetailDto } from "@/features/issues/types/issue.types";

// Jira-style fast-add: type a title, Enter (or the button) creates a TASK that
// lands in the backlog. Calls the existing create endpoint, then `onCreated`
// (the planning view refreshes so the new issue appears in order).
export function InlineCreateIssue({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const issue = await apiRequest<IssueDetailDto>(`/api/projects/${projectId}/issues`, {
        method: "POST",
        body: { type: "TASK", title: trimmed, priority: "MEDIUM" },
      });
      toast.success(`${issue.key} created`);
      setTitle("");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the issue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        aria-label="New issue title"
        placeholder="Add an issue to the backlog…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        className="flex-1"
      />
      <Button size="sm" variant="outline" onClick={submit} disabled={!title.trim() || submitting}>
        Add
      </Button>
    </div>
  );
}
