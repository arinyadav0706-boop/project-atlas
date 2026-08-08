"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { CommentComposer } from "@/features/comments/components/comment-composer";
import { CommentRow } from "@/features/comments/components/comment-row";
import type { CommentDto, CommentThreadDto } from "@/features/comments/types/comment.types";

// One thread's own page (ADR-0038 §4).
//
// The whole history of a single comment, paginated, with a breadcrumb back to
// the issue. This exists so the issue page never has to grow without bound —
// a discussion that outgrows its preview gets a URL of its own instead.
export function CommentThreadView({ initial }: { initial: CommentThreadDto }) {
  const [root, setRoot] = useState<CommentDto>(initial.root);
  const [replies, setReplies] = useState<CommentDto[]>(initial.replies);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [total, setTotal] = useState(initial.replyCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [posting, setPosting] = useState(false);
  const issueHref = `/projects/${initial.issue.projectId}/issues/${initial.issue.id}`;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<CommentThreadDto>(
        `/api/comments/${root.id}/thread?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setReplies((prev) => [...prev, ...page.replies]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load more replies.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function reply(body: string) {
    if (posting) return;
    setPosting(true);
    try {
      const created = await apiRequest<CommentDto>(
        `/api/issues/${initial.issue.id}/comments`,
        { method: "POST", body: { body, parentCommentId: root.id } },
      );
      // Appended locally rather than refetching: this page is oldest-first, so
      // a new reply belongs at the end and the cursor stays valid.
      setReplies((prev) => [...prev, created]);
      setTotal((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't post the reply.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href={issueHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {initial.issue.key} · {initial.issue.title}
      </Link>

      <h1 className="mt-4 text-lg font-semibold text-foreground">
        Thread{total > 0 && ` · ${total} ${total === 1 ? "reply" : "replies"}`}
      </h1>

      <div className="mt-4">
        <CommentRow
          comment={root}
          onChanged={setRoot}
          // Deleting the root takes the thread with it (the service cascades to
          // replies), so there is nothing left to show here.
          onDeleted={() => {
            window.location.href = issueHref;
          }}
        />
      </div>

      <div className="mt-4 space-y-3 border-l-2 border-border pl-4">
        {replies.length === 0 && (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        )}
        {replies.map((r) => (
          <CommentRow
            key={r.id}
            comment={r}
            compact
            onChanged={(updated) =>
              setReplies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
            }
            onDeleted={(id) => {
              setReplies((prev) => prev.filter((c) => c.id !== id));
              setTotal((t) => Math.max(t - 1, 0));
            }}
          />
        ))}

        {nextCursor && (
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more replies"}
          </Button>
        )}
      </div>

      {initial.canComment && (
        <div className="mt-6">
          <CommentComposer
            issueId={initial.issue.id}
            placeholder="Reply to this thread…"
            submitLabel="Reply"
            busy={posting}
            onSubmit={reply}
          />
        </div>
      )}
    </div>
  );
}
