"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Loader2 } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import type {
  CodeLinkDto,
  CodeLinkStateDto,
} from "@/features/code-integration/types/code-integration.types";

// The Development panel (34_code_integration.md §6).
//
// Jira's equivalent is the model: a compact strip on the issue that answers
// "is there actually code for this" without leaving the page. Deliberately
// read-only — nothing here writes, because the git host is the source of truth
// and a button that pretended otherwise would lie the moment somebody pushed.

const STATE_STYLE: Record<CodeLinkStateDto, string> = {
  OPEN: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  MERGED: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  CLOSED: "bg-muted text-muted-foreground",
  NONE: "",
};

const STATE_LABEL: Record<CodeLinkStateDto, string> = {
  OPEN: "Open",
  MERGED: "Merged",
  CLOSED: "Closed",
  NONE: "",
};

/** Pipeline vocabularies differ by provider; these are the outcomes that matter. */
function pipelineTone(status: string): string {
  const value = status.toLowerCase();
  if (["success", "passed", "completed"].includes(value)) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (["failed", "failure", "canceled", "cancelled"].includes(value)) {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

function LinkRow({ link }: { link: CodeLinkDto }) {
  const Icon =
    link.kind === "MERGE_REQUEST"
      ? link.state === "MERGED"
        ? GitMerge
        : GitPullRequest
      : link.kind === "BRANCH"
        ? GitBranch
        : GitCommitHorizontal;

  return (
    <li>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] text-foreground">{link.title}</span>
            {link.state !== "NONE" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  STATE_STYLE[link.state],
                )}
              >
                {STATE_LABEL[link.state]}
              </span>
            )}
            {link.pipelineStatus && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  pipelineTone(link.pipelineStatus),
                )}
              >
                {link.pipelineStatus}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {link.repository}
            {link.kind === "COMMIT" && ` · ${link.externalId.slice(0, 8)}`}
            {link.authorName && ` · ${link.authorName}`}
          </span>
        </span>
      </a>
    </li>
  );
}

function Group({ title, links }: { title: string; links: CodeLinkDto[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title} · {links.length}
      </p>
      <ul className="space-y-0.5">
        {links.map((link) => (
          <LinkRow key={link.id} link={link} />
        ))}
      </ul>
    </div>
  );
}

export function DevelopmentPanel({ issueId }: { issueId: string }) {
  const [links, setLinks] = useState<CodeLinkDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks(await apiRequest<CodeLinkDto[]>(`/api/issues/${issueId}/code-links`));
    } catch {
      // Silent: the panel is supplementary, and a toast about code links on
      // every issue load would be worse than an absent section.
      setFailed(true);
    }
  }, [issueId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing to say yet, and nothing worth a spinner in the rail.
  if (failed) return null;
  if (links === null) {
    return (
      <section className="rounded-2xl border border-border bg-background p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="size-3.5" />
          Development
        </h2>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </p>
      </section>
    );
  }

  const branches = links.filter((l) => l.kind === "BRANCH");
  const commits = links.filter((l) => l.kind === "COMMIT");
  const mergeRequests = links.filter((l) => l.kind === "MERGE_REQUEST");

  return (
    <section className="rounded-2xl border border-border bg-background p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <GitBranch className="size-3.5" />
        Development
      </h2>

      {links.length === 0 ? (
        // The empty state carries the convention, because the trigger is
        // invisible: a feature nobody knows how to start is a feature nobody
        // uses. This sentence is most of the module's adoption.
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Nothing linked yet. Put this issue&apos;s key in a branch name, commit message
          or merge request title and it will appear here automatically.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <Group title="Merge requests" links={mergeRequests} />
          <Group title="Branches" links={branches} />
          <Group title="Commits" links={commits} />
        </div>
      )}
    </section>
  );
}
