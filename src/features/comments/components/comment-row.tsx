"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { CommentBody } from "@/features/comments/components/comment-body";
import type { CommentDto } from "@/features/comments/types/comment.types";

// One comment: author, body, and the viewer's own affordances. Shared by the
// issue page and the thread page so a comment reads identically on both — the
// same reasoning as `issueCardSelect` for issue rows.
export function CommentRow({
  comment,
  compact = false,
  onChanged,
  onDeleted,
  onReply,
  footer,
}: {
  comment: CommentDto;
  /** Replies render slightly tighter than roots. */
  compact?: boolean;
  onChanged: (c: CommentDto) => void;
  onDeleted: (id: string) => void;
  /** Absent on a reply — threads are one level deep (ADR-0038 §4). */
  onReply?: () => void;
  footer?: React.ReactNode;
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
      <Avatar className={compact ? "h-6 w-6 shrink-0" : "h-7 w-7 shrink-0"}>
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
            {/* A plain textarea, not the composer: editing an existing body
                does not need the mention menu, and reusing the composer here
                would fight its own "clear on submit" behaviour. Existing
                tokens are preserved verbatim. */}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit comment"
            />
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
          <CommentBody
            body={comment.body}
            className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground"
          />
        )}

        {!editing && (comment.canEdit || comment.canDelete || onReply) && (
          <div className="mt-1.5 flex gap-3 text-xs">
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                Reply
              </button>
            )}
            {comment.canEdit && (
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className="text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                Edit
              </button>
            )}
            {comment.canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive focus-visible:underline focus-visible:outline-none"
              >
                Delete
              </button>
            )}
          </div>
        )}

        {footer}
      </div>
    </div>
  );
}
