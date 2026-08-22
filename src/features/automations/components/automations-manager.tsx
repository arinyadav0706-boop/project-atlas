"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { describeRule, type NameBook } from "@/features/automations/lib/engine";
import type {
  AutomationRuleDto,
  AutomationRunDto,
  AutomationRunOutcomeDto,
  AutomationsDto,
} from "@/features/automations/types/automation.types";
import { RuleBuilder, type BuilderOptions } from "@/features/automations/components/rule-builder";
import type { WorkflowDto } from "@/features/workflow/types/workflow.types";
import type { LabelListDto } from "@/features/labels/types/label.types";

// The rule list and run log (31_automations.md §6).
//
// Both are visible to anyone who can see the project (BR-9). Only the controls
// are gated: automated behaviour that only admins can explain is worse than no
// automation, because the person asking "why did my ticket move" is rarely the
// person who wrote the rule.

const OUTCOME_STYLE: Record<AutomationRunOutcomeDto, { label: string; className: string }> = {
  SUCCESS: { label: "Ran", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  SKIPPED: { label: "Skipped", className: "bg-muted text-muted-foreground" },
  FAILED: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function OutcomeChip({ outcome }: { outcome: AutomationRunOutcomeDto }) {
  const style = OUTCOME_STYLE[outcome];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

export function AutomationsManager({
  projectId,
  members,
}: {
  projectId: string;
  members: { userId: string; name: string }[];
}) {
  const [data, setData] = useState<AutomationsDto | null>(null);
  const [options, setOptions] = useState<BuilderOptions>({ statuses: [], members, labels: [] });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rule: AutomationRuleDto | null } | null>(null);
  const [deleting, setDeleting] = useState<AutomationRuleDto | null>(null);
  const [runs, setRuns] = useState<AutomationRunDto[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [rules, workflow, labels] = await Promise.all([
        apiRequest<AutomationsDto>(`/api/projects/${projectId}/automations`),
        apiRequest<WorkflowDto>(`/api/projects/${projectId}/statuses`),
        apiRequest<LabelListDto>(`/api/labels`),
      ]);
      setData(rules);
      setOptions({ statuses: workflow.statuses, members, labels: labels.items });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load automations.");
    }
  }, [projectId, members]);

  useEffect(() => {
    void load();
  }, [load]);

  const names: NameBook = useMemo(
    () => ({
      statuses: Object.fromEntries(options.statuses.map((s) => [s.id, s.name])),
      users: Object.fromEntries(options.members.map((m) => [m.userId, m.name])),
      labels: Object.fromEntries(options.labels.map((l) => [l.id, l.name])),
    }),
    [options],
  );

  const mutate = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await fn();
        await load();
        toast.success(success);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const openRunLog = useCallback(async () => {
    setRuns([]);
    try {
      setRuns(
        await apiRequest<AutomationRunDto[]>(
          `/api/projects/${projectId}/automations/runs?take=50`,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load the run log.");
      setRuns(null);
    }
  }, [projectId]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading automations…
      </p>
    );
  }

  const { rules, canManage } = data;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {rules.length === 0
            ? "No rules yet."
            : `${rules.length} rule${rules.length === 1 ? "" : "s"}, ${rules.filter((r) => r.enabled).length} active.`}
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={openRunLog}>
            <History className="mr-1 size-3.5" />
            Run log
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setEditing({ rule: null })}>
              <Plus className="mr-1 size-3.5" />
              New rule
            </Button>
          )}
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <Zap className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">
            Let the project do its own admin
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            A rule watches for one thing — an issue created, a status change — checks
            what you tell it to, and acts. “When a bug is created and priority is
            Highest, assign the on-call lead and post the checklist.”
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={cn(
                "rounded-xl border border-border bg-background p-3",
                !rule.enabled && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {rule.name}
                    </span>
                    {rule.broken && (
                      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        <AlertTriangle className="size-3" />
                        Needs fixing
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {rule.broken
                      ? `This rule ${rule.broken}. Edit it to fix.`
                      : describeRule(rule, names)}
                  </p>
                  {rule.lastRun && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <OutcomeChip outcome={rule.lastRun.outcome} />
                      <span className="truncate">
                        {rule.lastRun.detail} · {ago(rule.lastRun.createdAt)}
                      </span>
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={rule.enabled}
                      disabled={busy}
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                      onCheckedChange={(enabled) =>
                        void mutate(
                          () =>
                            apiRequest(`/api/projects/${projectId}/automations/${rule.id}`, {
                              method: "PATCH",
                              body: { enabled },
                            }),
                          enabled ? "Rule enabled." : "Rule disabled.",
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => setEditing({ rule })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleting(rule)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RuleBuilder
          // Remounts per rule, so the form's state starts from the rule being
          // edited rather than from whatever was open last.
          key={editing.rule?.id ?? "new"}
          open
          rule={editing.rule}
          options={options}
          saving={busy}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const target = editing.rule;
            void mutate(
              () =>
                target
                  ? apiRequest(`/api/projects/${projectId}/automations/${target.id}`, {
                      method: "PATCH",
                      body: input,
                    })
                  : apiRequest(`/api/projects/${projectId}/automations`, {
                      method: "POST",
                      body: { ...input, enabled: true },
                    }),
              target ? "Rule updated." : "Rule created.",
            ).then((ok) => ok && setEditing(null));
          }}
        />
      )}

      <Dialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent className="w-[min(440px,94vw)]">
          <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
          <DialogDescription>
            It stops running immediately. Its run log stays — the record of what an
            automation did outlives the rule. Disabling it instead keeps it editable.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const target = deleting;
                if (!target) return;
                void mutate(
                  () =>
                    apiRequest(`/api/projects/${projectId}/automations/${target.id}`, {
                      method: "DELETE",
                    }),
                  "Rule deleted.",
                ).then((ok) => ok && setDeleting(null));
              }}
            >
              Delete rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={runs !== null} onOpenChange={(v) => !v && setRuns(null)}>
        <DialogContent className="max-h-[80vh] w-[min(640px,94vw)] overflow-y-auto">
          <DialogTitle>Run log</DialogTitle>
          <DialogDescription>
            Every evaluation, newest first — including the ones that decided not to act.
            “Why didn’t my rule fire” is the more common question.
          </DialogDescription>
          <ul className="mt-4 space-y-1.5">
            {runs?.length === 0 && (
              <li className="py-6 text-center text-[13px] text-muted-foreground">
                Nothing has run yet.
              </li>
            )}
            {runs?.map((run) => (
              <li
                key={run.id}
                className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
              >
                <OutcomeChip outcome={run.outcome} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    <span className="font-medium">{run.ruleName}</span>
                    {run.issueKey && (
                      <span className="text-muted-foreground"> · {run.issueKey}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{run.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {ago(run.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
