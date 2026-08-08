"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { CommentComposer } from "@/features/comments/components/comment-composer";
import { CommentRow } from "@/features/comments/components/comment-row";
import { formatMention } from "@/features/comments/lib/mentions";
import type { CommentDto, CommentPageDto } from "@/features/comments/types/comment.types";

// The Comments thread on an issue (08_comments.md, ADR-0038).
//
// Top-level comments, each with its newest few replies. A thread bigger than
// that preview links to its own page rather than expanding here — that is what
// keeps this section's cost constant however large a discussion grows
// (ADR-0038 §4).
export function CommentsSection({
  issueId,
  projectId,
  initialPage,
}: {
  issueId: string;
  projectId: string;
  initialPage: CommentPageDto;
}) {
  const [items, setItems] = useState<CommentDto[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [total, setTotal] = useState(initialPage.totalCount);
  const [posting, setPosting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Which root's composer is open, and what it starts with. Replying to a
  // reply re-parents to the root (threads are one level deep) — so the box
  // opens pre-addressed to the person being answered, exactly as YouTube and
  // Instagram do. Without it the re-parenting loses who was being replied to.
  const [replyingTo, setReplyingTo] = useState<{ rootId: string; prefill: string } | null>(null);
  const canComment = initialPage.canComment;

  function replaceIn(list: CommentDto[], updated: CommentDto): CommentDto[] {
    return list.map((c) =>
      c.id === updated.id
        ? { ...updated, replies: c.replies, replyCount: c.replyCount }
        : { ...c, replies: c.replies.map((r) => (r.id === updated.id ? updated : r)) },
    );
  }

  function removeFrom(list: CommentDto[], id: string): CommentDto[] {
    return list
      .filter((c) => c.id !== id)
      .map((c) =>
        c.replies.some((r) => r.id === id)
          ? {
              ...c,
              replies: c.replies.filter((r) => r.id !== id),
              replyCount: Math.max(c.replyCount - 1, 0),
            }
          : c,
      );
  }

  async function post(body: string, parentCommentId?: string) {
    if (posting) return;
    setPosting(true);
    try {
      const created = await apiRequest<CommentDto>(`/api/issues/${issueId}/comments`, {
        method: "POST",
        body: { body, ...(parentCommentId ? { parentCommentId } : {}) },
      });
      if (parentCommentId) {
        setItems((prev) =>
          prev.map((c) =>
            c.id === parentCommentId
              ? { ...c, replies: [...c.replies, created], replyCount: c.replyCount + 1 }
              : c,
          ),
        );
        setReplyingTo(null);
      } else {
        setItems((prev) => [...prev, created]);
        setTotal((t) => t + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't post the comment.");
    } finally {
      setPosting(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<CommentPageDto>(
        `/api/issues/${issueId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load more comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Comments{total > 0 && ` (${total})`}
      </h2>

      {nextCursor && (
        <div className="mb-3">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load earlier comments"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}

        {items.map((comment) => {
          const hidden = comment.replyCount - comment.replies.length;
          return (
            <CommentRow
              key={comment.id}
              comment={comment}
              onReply={
                canComment
                  ? () => setReplyingTo({ rootId: comment.id, prefill: "" })
                  : undefined
              }
              onChanged={(updated) => setItems((prev) => replaceIn(prev, updated))}
              onDeleted={(id) => setItems((prev) => removeFrom(prev, id))}
              footer={
                (comment.replies.length > 0 || replyingTo?.rootId === comment.id) && (
                  <div className="mt-3 space-y-3 border-l-2 border-border pl-3">
                    {hidden > 0 && (
                      <Link
                        href={`/projects/${projectId}/issues/${issueId}/comments/${comment.id}`}
                        className="block text-xs font-medium text-accent hover:underline"
                      >
                        View all {comment.replyCount} replies
                      </Link>
                    )}

                    {comment.replies.map((reply) => (
                      <CommentRow
                        key={reply.id}
                        comment={reply}
                        compact
                        onReply={
                          canComment
                            ? () =>
                                setReplyingTo({
                                  rootId: comment.id,
                                  // A real mention token, so the person being
                                  // answered is actually notified — not just
                                  // named in passing.
                                  prefill: `${formatMention({
                                    id: reply.author.id,
                                    name: reply.author.name,
                                  })} `,
                                })
                            : undefined
                        }
                        onChanged={(updated) => setItems((prev) => replaceIn(prev, updated))}
                        onDeleted={(id) => setItems((prev) => removeFrom(prev, id))}
                      />
                    ))}

                    {replyingTo?.rootId === comment.id && (
                      <CommentComposer
                        // Remount when the prefill changes, so clicking Reply
                        // on a different reply re-addresses the open box.
                        key={replyingTo.prefill}
                        issueId={issueId}
                        autoFocus
                        initialValue={replyingTo.prefill}
                        placeholder={`Reply to ${comment.author.name}…`}
                        submitLabel="Reply"
                        busy={posting}
                        onSubmit={(body) => post(body, comment.id)}
                        onCancel={() => setReplyingTo(null)}
                      />
                    )}
                  </div>
                )
              }
            />
          );
        })}
      </div>

      {canComment && (
        <div className="mt-4">
          <CommentComposer issueId={issueId} busy={posting} onSubmit={(body) => post(body)} />
        </div>
      )}
    </section>
  );
}
