"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import { StatusSwatch, statusColorClass } from "@/features/workflow/components/status-swatch";
import {
  CATEGORY_HELP,
  CATEGORY_LABEL,
  STATUS_COLORS,
} from "@/features/workflow/lib/defaults";
import {
  STATUS_CATEGORIES,
  type StatusCategoryDto,
  type WorkflowDto,
  type WorkflowStatusWithCountDto,
} from "@/features/workflow/types/workflow.types";

// The status editor (30_workflow.md §5).
//
// Reorder is drag-and-drop with a keyboard path beside it, for the reason the
// Calendar's panel has one: a drag-only control is unusable without a mouse,
// and "shipped a gesture, forgot the keyboard" is how a feature becomes an
// accessibility bug.

export function StatusManager({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<WorkflowDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<WorkflowStatusWithCountDto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<WorkflowDto>(`/api/projects/${projectId}/statuses`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load statuses.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await fn();
        await load();
        // The board and every status picker read this list, so they are stale
        // the moment it changes.
        router.refresh();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
      } finally {
        setBusy(false);
      }
    },
    [load, router],
  );

  if (!data) {
    return <p className="text-[13px] text-muted-foreground">Loading statuses…</p>;
  }
  if (!data.canManage) {
    return (
      <div className="space-y-2">
        {data.statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[13px]">
            <StatusSwatch color={s.color} />
            <span>{s.name}</span>
            <span className="text-muted-foreground">
              {CATEGORY_LABEL[s.category]} · {s.issueCount}
            </span>
          </div>
        ))}
        <p className="pt-2 text-[12px] text-muted-foreground">
          Only a project lead can change these.
        </p>
      </div>
    );
  }

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = data.statuses.map((s) => s.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    void mutate(
      () =>
        apiRequest(`/api/projects/${projectId}/statuses/order`, {
          method: "PUT",
          // The COMPLETE order, never just the moved id (BR-8).
          body: { statusIds: ids },
        }),
      "Order saved",
    );
  };

  const move = (index: number, delta: number) => {
    const target = data.statuses[index + delta];
    if (target) reorder(data.statuses[index]!.id, target.id);
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {data.statuses.map((status, i) => (
          <li
            key={status.id}
            draggable
            onDragStart={() => setDragId(status.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) reorder(dragId, status.id);
              setDragId(null);
            }}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-2",
              dragId === status.id && "opacity-50",
            )}
            data-status-row={status.name}
          >
            <GripVertical
              className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60"
              aria-hidden
            />

            {/* Keyboard equivalent of the drag, always present. */}
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0 || busy}
                aria-label={`Move ${status.name} up`}
                className="px-1 text-[9px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === data.statuses.length - 1 || busy}
                aria-label={`Move ${status.name} down`}
                className="px-1 text-[9px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            <ColorPicker
              value={status.color}
              disabled={busy}
              onChange={(color) =>
                void mutate(
                  () =>
                    apiRequest(`/api/projects/${projectId}/statuses/${status.id}`, {
                      method: "PATCH",
                      body: { color },
                    }),
                  "Colour saved",
                )
              }
            />

            <InlineName
              value={status.name}
              disabled={busy}
              onSave={(name) =>
                mutate(
                  () =>
                    apiRequest(`/api/projects/${projectId}/statuses/${status.id}`, {
                      method: "PATCH",
                      body: { name },
                    }),
                  "Renamed",
                )
              }
            />

            <CategorySelect
              value={status.category}
              disabled={busy}
              onChange={(category) =>
                void mutate(
                  () =>
                    apiRequest(`/api/projects/${projectId}/statuses/${status.id}`, {
                      method: "PATCH",
                      body: { category },
                    }),
                  "Category saved",
                )
              }
            />

            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {status.issueCount} {status.issueCount === 1 ? "issue" : "issues"}
            </span>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || status.isDefault}
                title={
                  status.isDefault
                    ? "New issues start here"
                    : "Make this where new issues start"
                }
                aria-label={`Make ${status.name} the default`}
                onClick={() =>
                  void mutate(
                    () =>
                      apiRequest(`/api/projects/${projectId}/statuses/${status.id}`, {
                        method: "PATCH",
                        body: { isDefault: true },
                      }),
                    `New issues now start in ${status.name}`,
                  )
                }
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    status.isDefault && "fill-amber-400 text-amber-500",
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Delete ${status.name}`}
                onClick={() => setDeleting(status)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={busy}>
        <Plus className="h-3.5 w-3.5" />
        Add status
      </Button>

      <TransitionSection
        projectId={projectId}
        data={data}
        busy={busy}
        onSaved={() => void load()}
      />

      {adding && (
        <AddStatusDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
            router.refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteStatusDialog
          projectId={projectId}
          status={deleting}
          others={data.statuses.filter((s) => s.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function InlineName({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (name: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      value={draft}
      disabled={disabled}
      aria-label={`Name of ${value}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (!next || next === value) {
          setDraft(value);
          return;
        }
        void onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className="h-8 w-[160px] text-[13px]"
    />
  );
}

function ColorPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Colour, currently ${value}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
      >
        <StatusSwatch color={value} className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 flex gap-1 rounded-lg border border-border bg-background p-1.5 shadow-pop">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                "h-4 w-4 rounded-full ring-offset-1 transition-transform hover:scale-110",
                statusColorClass(c),
                c === value && "ring-2 ring-accent",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategorySelect({
  value,
  disabled,
  onChange,
}: {
  value: StatusCategoryDto;
  disabled: boolean;
  onChange: (category: StatusCategoryDto) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as StatusCategoryDto)}
    >
      <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddStatusDialog({
  projectId,
  onClose,
  onAdded,
}: {
  projectId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategoryDto>("IN_PROGRESS");
  const [color, setColor] = useState<string>("violet");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Add a status</DialogTitle>
        <DialogDescription>
          It becomes a column on the board, in the position you put it.
        </DialogDescription>
        <div className="mt-4 space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Blocked"
            aria-label="Status name"
          />
          <div className="flex items-center gap-2">
            <ColorPicker value={color} disabled={saving} onChange={setColor} />
            <CategorySelect value={category} disabled={saving} onChange={setCategory} />
          </div>
          {/* The one choice with consequences past the board — say what they are
              rather than listing four enum values and letting people guess. */}
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
            {CATEGORY_HELP[category]}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await apiRequest(`/api/projects/${projectId}/statuses`, {
                  method: "POST",
                  body: { name: name.trim(), category, color },
                });
                toast.success(`Added ${name.trim()}`);
                onAdded();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't add it.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Add status
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStatusDialog({
  projectId,
  status,
  others,
  onClose,
  onDeleted,
}: {
  projectId: string;
  status: WorkflowStatusWithCountDto;
  others: WorkflowStatusWithCountDto[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  // Only same-category replacements are offered: moving work to a different
  // kind of status would change whether it counts as finished (BR-6), and the
  // server refuses it anyway — better not to offer it than to explain it after.
  const candidates = others.filter((s) => s.category === status.category);
  const [replacementId, setReplacementId] = useState(candidates[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Delete “{status.name}”</DialogTitle>
        <DialogDescription>
          {status.issueCount > 0
            ? `${status.issueCount} ${status.issueCount === 1 ? "issue is" : "issues are"} in this status. Choose where they go.`
            : "Nothing is in this status."}
        </DialogDescription>

        {candidates.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
            This is the only <b>{CATEGORY_LABEL[status.category].toLowerCase()}</b> status.
            Add another one before deleting this.
          </p>
        ) : (
          <div className="mt-4">
            <Select value={replacementId} onValueChange={setReplacementId}>
              <SelectTrigger aria-label="Move its issues to">
                <SelectValue placeholder="Move its issues to…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!replacementId || saving || candidates.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await apiRequest<{ movedIssues: number }>(
                  `/api/projects/${projectId}/statuses/${status.id}`,
                  { method: "DELETE", body: { replacementId } },
                );
                toast.success(
                  res.movedIssues > 0
                    ? `Deleted — ${res.movedIssues} issue${res.movedIssues === 1 ? "" : "s"} moved`
                    : "Deleted",
                );
                onDeleted();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't delete it.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Delete status
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransitionSection({
  projectId,
  data,
  busy,
  onSaved,
}: {
  projectId: string;
  data: WorkflowDto;
  busy: boolean;
  onSaved: () => void;
}) {
  const key = (from: string, to: string) => `${from}>${to}`;
  const [allowed, setAllowed] = useState<Set<string>>(
    () => new Set(data.transitions.map((t) => key(t.fromStatusId, t.toStatusId))),
  );
  const [enforce, setEnforce] = useState(data.enforceTransitions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAllowed(new Set(data.transitions.map((t) => key(t.fromStatusId, t.toStatusId))));
    setEnforce(data.enforceTransitions);
  }, [data]);

  /**
   * Persist the pair.
   *
   * Turning the switch on does NOT save on its own. The server refuses
   * enforcement with an empty rule set — correctly, since it would freeze every
   * issue where it stands — and saving eagerly made that a deadlock: the switch
   * flipped back before the matrix could render, so there was no way to tick the
   * first box. So the switch reveals the matrix locally, and enforcement is
   * saved the moment the first move is allowed.
   */
  const save = async (nextEnforce: boolean, nextAllowed: Set<string>) => {
    if (nextEnforce && nextAllowed.size === 0) return;
    setSaving(true);
    try {
      await apiRequest(`/api/projects/${projectId}/transitions`, {
        method: "PUT",
        body: {
          enforce: nextEnforce,
          transitions: [...nextAllowed].map((k) => {
            const [fromStatusId, toStatusId] = k.split(">");
            return { fromStatusId, toStatusId };
          }),
        },
      });
      toast.success("Transitions saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
      setEnforce(data.enforceTransitions);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[13px] font-semibold">Restrict status changes</h3>
          <p className="mt-0.5 max-w-lg text-[12px] text-muted-foreground">
            Off by default, like ClickUp and Asana — anything can move anywhere. Turn it
            on to allow only the moves you tick, enforced for everyone.
          </p>
        </div>
        <Switch
          checked={enforce}
          disabled={busy || saving}
          aria-label="Restrict status changes"
          onCheckedChange={(v) => {
            setEnforce(v);
            // Off always persists; on waits for the first ticked move.
            void save(v, allowed);
          }}
        />
      </div>

      {enforce && allowed.size === 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          Tick at least one move below to turn this on. Until then nothing is
          restricted.
        </p>
      )}

      {enforce && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-[12px]">
            <thead>
              <tr>
                <th className="p-1.5 text-left font-medium text-muted-foreground">
                  From ↓ / To →
                </th>
                {data.statuses.map((s) => (
                  <th key={s.id} className="p-1.5 font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.statuses.map((from) => (
                <tr key={from.id}>
                  <td className="whitespace-nowrap p-1.5 font-medium">{from.name}</td>
                  {data.statuses.map((to) => (
                    <td key={to.id} className="p-1.5 text-center">
                      {from.id === to.id ? (
                        // Staying put is not a transition; a checkbox here would
                        // imply you could forbid an issue from being where it is.
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Allow ${from.name} to ${to.name}`}
                          checked={allowed.has(key(from.id, to.id))}
                          disabled={saving}
                          onChange={(e) => {
                            const next = new Set(allowed);
                            if (e.target.checked) next.add(key(from.id, to.id));
                            else next.delete(key(from.id, to.id));
                            setAllowed(next);
                            void save(enforce, next);
                          }}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
