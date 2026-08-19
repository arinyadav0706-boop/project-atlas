"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import type { IssueDetailDto } from "@/features/issues/types/issue.types";

// The description, edited where it is read.
//
// It used to be a static paragraph whose only editor was the "Edit issue"
// modal in the rail — which works, but nothing on the page said so. An empty
// description rendered as the grey words "No description." and a reader's
// entirely reasonable conclusion was that there was nowhere to put one. That is
// the failure this fixes: an empty field that looks like a dead end rather than
// an invitation.
//
// Jira, ClickUp and Asana all edit the description in place. So does this.

export function IssueDescription({ issue }: { issue: IssueDetailDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(issue.description ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-seed whenever the saved text changes underneath (someone else's edit
  // arriving via a refresh), but never while typing.
  useEffect(() => {
    if (!editing) setValue(issue.description ?? "");
  }, [issue.description, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function save() {
    if (saving) return;
    const next = value.trim();
    if (next === (issue.description ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/issues/${issue.id}`, {
        method: "PATCH",
        // Version-checked like every other edit (ADR-0011): if someone changed
        // the issue while this box was open, the save is refused rather than
        // silently overwriting their description with a stale one.
        body: { description: next || null, expectedVersion: issue.version },
      });
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the description.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(issue.description ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <section>
        <Heading />
        <Textarea
          ref={ref}
          value={value}
          rows={6}
          maxLength={20000}
          placeholder="What needs doing, and what does done look like?"
          aria-label="Description"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter saves, Escape abandons — the two shortcuts anyone
            // who has used a comment box already expects.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
            if (e.key === "Escape") cancel();
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={save} loading={saving}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <span className="text-[11px] text-muted-foreground">⌘↵ to save · Esc to cancel</span>
        </div>
      </section>
    );
  }

  if (!issue.description) {
    return (
      <section>
        <Heading />
        {issue.canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-accent/50 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a description
          </button>
        ) : (
          <p className="text-sm italic text-muted-foreground">No description.</p>
        )}
      </section>
    );
  }

  return (
    <section className="group/desc">
      <Heading
        action={
          issue.canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit description"
              // Revealed on hover so the panel stays quiet, but always reachable
              // by keyboard.
              className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/desc:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )
        }
      />
      <p
        className={
          issue.canEdit
            ? "-mx-2 cursor-text whitespace-pre-wrap rounded-lg px-2 py-1 text-sm leading-relaxed text-foreground transition-colors hover:bg-muted/50"
            : "whitespace-pre-wrap text-sm leading-relaxed text-foreground"
        }
        onClick={() => issue.canEdit && setEditing(true)}
      >
        {issue.description}
      </p>
    </section>
  );
}

function Heading({ action }: { action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Description
      </h2>
      {action}
    </div>
  );
}
