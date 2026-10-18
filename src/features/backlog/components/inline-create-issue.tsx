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
    <div className="mt-2.5 flex items-center gap-2 rounded-md border border-dashed border-border/80 bg-surface-sunken/40 px-2 py-1.5 transition-colors focus-within:border-primary/50 focus-within:bg-background">
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input
        aria-label="New issue title"
        placeholder="Add an issue to the backlog (press Enter to create)..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
      />
      <Button
        size="xs"
        variant="outline"
        onClick={submit}
        disabled={!title.trim() || submitting}
        className="shrink-0 h-6 px-2 text-[11px]"
      >
        Add
      </Button>
    </div>
  );
}
