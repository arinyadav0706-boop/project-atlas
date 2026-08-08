"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { apiRequest } from "@/shared/lib/api-client";
import {
  activeMentionQuery,
  displayToTokens,
  tokensToDisplay,
  type PickedMention,
} from "@/features/comments/lib/mentions";
import type { MentionableUserDto } from "@/features/comments/types/comment.types";

// A comment box with `@` autocomplete (ADR-0038 §1, amended).
//
// The box shows `@Amelia Nair`. It never shows an id.
//
// The first cut kept raw `@[Name](user:id)` tokens in the textarea and called
// that an acceptable trade against a contenteditable editor. It was not — no
// tool puts an internal id in front of a person mid-sentence. Storage stays
// id-based, which was the part worth keeping; the draft is display text, and
// `displayToTokens` reattaches ids on submit from the picks actually made.
//
// Still a plain textarea, so none of contenteditable's selection/paste/IME
// problems apply. What is lost is a rendered pill *shape* while typing, which
// is cosmetic; what is gained is that the text reads like a sentence.

const MENU_LIMIT = 8;

export function CommentComposer({
  issueId,
  placeholder = "Add a comment…",
  submitLabel = "Comment",
  autoFocus = false,
  initialValue = "",
  busy = false,
  onSubmit,
  onCancel,
}: {
  issueId: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  initialValue?: string;
  busy?: boolean;
  onSubmit: (body: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const initial = tokensToDisplay(initialValue);
  const [value, setValue] = useState(initial.text);
  // Names the user chose, with the id each resolved to. The only source for
  // turning display text back into tokens — so a name that was never picked
  // can never become a mention.
  const [picked, setPicked] = useState<PickedMention[]>(initial.picked);
  const [candidates, setCandidates] = useState<MentionableUserDto[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [trigger, setTrigger] = useState<{ query: string; from: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against an older, slower search overwriting a newer one.
  const requestSeq = useRef(0);

  const closeMenu = useCallback(() => {
    setTrigger(null);
    setCandidates([]);
    setHighlighted(0);
  }, []);

  // Fetch candidates for the active `@…` run, debounced.
  useEffect(() => {
    if (!trigger) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ items: MentionableUserDto[] }>(
          `/api/issues/${issueId}/mentionable?q=${encodeURIComponent(trigger.query)}`,
        );
        if (seq !== requestSeq.current) return;
        setCandidates(res.items.slice(0, MENU_LIMIT));
        setHighlighted(0);
      } catch {
        // A failed lookup closes the menu rather than surfacing a toast — the
        // user is mid-sentence, and an error banner over the composer would be
        // more disruptive than the missing suggestion.
        if (seq === requestSeq.current) setCandidates([]);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [trigger, issueId]);

  function syncTrigger(text: string, caret: number) {
    const next = activeMentionQuery(text, caret);
    if (!next) {
      closeMenu();
      return;
    }
    // Only re-fetch when the query text actually changes; moving the caret
    // inside the same run should not re-open a request.
    setTrigger((prev) =>
      prev && prev.query === next.query && prev.from === next.from ? prev : next,
    );
  }

  function choose(user: MentionableUserDto) {
    const el = textareaRef.current;
    if (!el || !trigger) return;
    const caretNow = el.selectionStart;
    const rest = value.slice(caretNow);
    const label = `@${user.name}`;
    const insert = /^\s/.test(rest) ? label : `${label} `;
    const text = value.slice(0, trigger.from) + insert + rest;
    const caret = trigger.from + insert.length;

    setValue(text);
    setPicked((prev) =>
      prev.some((p) => p.userId === user.id && p.name === user.name)
        ? prev
        : [...prev, { name: user.name, userId: user.id }],
    );
    closeMenu();
    // Restore the caret after React commits the new value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  const menuOpen = trigger !== null && candidates.length > 0;

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((h) => (h + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((h) => (h - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const picked = candidates[highlighted];
        if (picked) choose(picked);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
    }
    // Submit shortcut, only when the menu is not capturing Enter.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  async function submit() {
    const display = value.trim();
    if (!display || busy) return;
    // Display → storage happens here, once, at the boundary.
    await onSubmit(displayToTokens(display, picked));
    setValue("");
    setPicked([]);
    closeMenu();
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        rows={3}
        onChange={(e) => {
          setValue(e.target.value);
          syncTrigger(e.target.value, e.target.selectionStart);
        }}
        onKeyUp={(e) => syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart)}
        onClick={(e) => syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delayed so a click on a menu row lands before the menu unmounts.
          setTimeout(closeMenu, 120);
        }}
      />

      {menuOpen && (
        <ul
          role="listbox"
          aria-label="Mention a teammate"
          className="absolute z-20 mt-1 max-h-60 w-72 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {candidates.map((user, i) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(user)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  i === highlighted ? "bg-accent/15 text-foreground" : "text-muted-foreground"
                }`}
              >
                <Avatar className="h-5 w-5 shrink-0">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[9px]">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-foreground">{user.name}</span>
                {/* Everyone in the org is mentionable; this marks who is
                    actually on the project, which is the useful distinction
                    when two people share a first name. */}
                {!user.isProjectMember && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    not on project
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">
          Type <kbd className="rounded border border-border px-1">@</kbd> to mention
        </span>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={submit} loading={busy} disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
