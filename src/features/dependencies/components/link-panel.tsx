"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  IssueTypeIcon,
  StatusDot,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import {
  RELATION_LABEL,
  RELATION_ORDER,
  type IssueLinkDto,
  type LinkRelationDto,
} from "@/features/dependencies/types/dependency.types";

// Linked issues (27_dependencies.md §5).
//
// Grouped by the SENTENCE the relationship makes — "Blocked by", "Blocks",
// "Relates to" — not by an arrow glyph the reader has to decode. "Blocked by"
// is first because what is in your way is the reason anybody opens this panel.

/** The five sentences, as the five things you can pick when adding one. */
const ADD_OPTIONS: { relation: LinkRelationDto; type: string; direction: string }[] = [
  { relation: "IS_BLOCKED_BY", type: "BLOCKS", direction: "inward" },
  { relation: "BLOCKS", type: "BLOCKS", direction: "outward" },
  { relation: "RELATES_TO", type: "RELATES_TO", direction: "outward" },
  { relation: "DUPLICATES", type: "DUPLICATES", direction: "outward" },
  { relation: "IS_DUPLICATED_BY", type: "DUPLICATES", direction: "inward" },
];

export function LinkPanel({
  issueId,
  links,
  canEdit,
}: {
  issueId: string;
  links: IssueLinkDto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [relation, setRelation] = useState<LinkRelationDto>("IS_BLOCKED_BY");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    const typed = key.trim();
    if (!typed || saving) return;
    const option = ADD_OPTIONS.find((o) => o.relation === relation)!;
    setSaving(true);
    try {
      await apiRequest(`/api/issues/${issueId}/links`, {
        method: "POST",
        body: { type: option.type, direction: option.direction, targetKey: typed },
      });
      setKey("");
      setAdding(false);
      router.refresh();
    } catch (error) {
      // The cycle refusal names the whole loop, so it is worth the room.
      toast.error(error instanceof Error ? error.message : "Couldn't link those issues.", {
        duration: 8000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(link: IssueLinkDto) {
    try {
      await apiRequest(`/api/issue-links/${link.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the link.");
    }
  }

  const grouped = RELATION_ORDER.map((r) => ({
    relation: r,
    items: links.filter((l) => l.relation === r),
  })).filter((g) => g.items.length > 0);

  // Nothing to show and nothing to do — stay out of the way entirely.
  if (grouped.length === 0 && !canEdit) return null;

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Linked issues
        </h2>
        {canEdit && !adding && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add link
          </Button>
        )}
      </div>

      {grouped.length === 0 && !adding && (
        <p className="text-[13px] text-muted-foreground">
          Nothing linked yet. Record what this is waiting on, or what it duplicates.
        </p>
      )}

      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group.relation}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {RELATION_LABEL[group.relation]}
            </p>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
              {group.items.map((link) => (
                <li key={link.id} className="group/link flex items-center gap-2 px-3 py-2">
                  <Row link={link} />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(link)}
                      aria-label={`Remove link to ${link.issue.restricted ? "a restricted issue" : link.issue.key}`}
                      className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/link:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canEdit && adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={relation}
            onValueChange={(v) => setRelation(v as LinkRelationDto)}
          >
            <SelectTrigger aria-label="Relationship" className="w-auto min-w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADD_OPTIONS.map((o) => (
                <SelectItem key={o.relation} value={o.relation}>
                  {RELATION_LABEL[o.relation]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={key}
            // A key, not a search box: people know the key of the thing that is
            // blocking them, and typing "VWP-42" is faster than any picker.
            // A cross-project search is the follow-up (backlog DEP-3).
            placeholder="Issue key, e.g. VWP-42"
            aria-label="Issue key to link"
            className="w-52"
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" onClick={add} loading={saving} disabled={!key.trim()}>
            Link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ link }: { link: IssueLinkDto }) {
  // BR-6: the link is real and shown, the issue behind it is not described.
  // Dropping the row instead would make "nothing is blocking this" a lie.
  if (link.issue.restricted) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted-foreground">
        <EyeOff className="h-3.5 w-3.5 shrink-0" />
        <span className="italic">An issue in a project you can&apos;t access</span>
      </span>
    );
  }

  const issue = link.issue;
  return (
    <Link
      href={`/projects/${issue.projectId}/issues/${issue.id}`}
      className="flex min-w-0 flex-1 items-center gap-2 text-sm focus-visible:outline-none focus-visible:underline"
    >
      <IssueTypeIcon type={issue.type} className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-foreground",
          issue.status === "DONE" && "text-muted-foreground line-through",
        )}
      >
        {issue.title}
      </span>
      {/* The one piece of state that changes what a reader should do next. */}
      {link.blocking && (
        <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
          Blocking
        </span>
      )}
      <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
        <StatusDot status={issue.status} />
        {statusLabel(issue.status)}
      </span>
    </Link>
  );
}
