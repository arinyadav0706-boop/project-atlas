"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import type { CommentDto, CommentPageDto } from "@/features/comments/types/comment.types";

// The Comments thread on an issue (08_comments.md). Flat list + composer; edit
// and delete the viewer's own (a LEAD may delete any). Body is rendered as plain,
// escaped text (React escapes by default) — the XSS boundary (ADR-0016); a
// rich-text renderer swaps in later off `bodyFormat`.
export function CommentsSection({
  issueId,
  initialPage,
}: {
  issueId: string;
  initialPage: CommentPageDto;
}) {
  const [items, setItems] = useState<CommentDto[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const canComment = initialPage.canComment;

  async function post() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const created = await apiRequest<CommentDto>(`/api/issues/${issueId}/comments`, {
        method: "POST",
        body: { body },
      });
      setItems((prev) => [...prev, created]);
      setDraft("");
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
        Comments{items.length > 0 && ` (${items.length}${nextCursor ? "+" : ""})`}
      </h2>

      {nextCursor && (
        <div className="mb-3">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load earlier comments"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
        {items.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            onChanged={(updated) =>
              setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
            }
            onDeleted={(id) => setItems((prev) => prev.filter((c) => c.id !== id))}
          />
        ))}
      </div>

      {canComment && (
        <div className="mt-4">
          <Textarea
            aria-label="Add a comment"
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={post} loading={posting} disabled={!draft.trim()}>
              Comment
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  onChanged,
  onDeleted,
}: {
  comment: CommentDto;
  onChanged: (c: CommentDto) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  async function save() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const updated = await apiRequest<CommentDto>(`/api/comments/${comment.id}`, {
        method: "PATCH",
        body: { body, expectedVersion: comment.version },
      });
      onChanged(updated);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the edit.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/comments/${comment.id}`, { method: "DELETE" });
      onDeleted(comment.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the comment.");
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-7 w-7 shrink-0">
        {comment.author.avatarUrl && (
          <AvatarImage src={comment.author.avatarUrl} alt={comment.author.name} />
        )}
        <AvatarFallback className="text-[11px]">
          {comment.author.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.author.name}</span>
          <span>{new Date(comment.createdAt).toLocaleString()}</span>
          {comment.editedAt && <span>· edited</span>}
        </div>

        {editing ? (
          <div className="mt-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit comment" />
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} loading={busy} disabled={!draft.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {comment.body}
          </p>
        )}

        {!editing && (comment.canEdit || comment.canDelete) && (
          <div className="mt-1.5 flex gap-3 text-xs">
            {comment.canEdit && (
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
              >
                Edit
              </button>
            )}
            {comment.canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:underline"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
