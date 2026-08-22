"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
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
import { cn } from "@/shared/lib/utils";
import { STATUS_CATEGORIES, type WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import { CATEGORY_LABEL } from "@/features/workflow/lib/defaults";
import type { LabelDto } from "@/features/labels/types/label.types";
import {
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCondition,
  type AutomationConditionKind,
  type AutomationRuleDto,
  type AutomationTriggerDto,
} from "@/features/automations/types/automation.types";
import {
  MAX_ACTIONS_PER_RULE,
  MAX_CONDITIONS_PER_RULE,
} from "@/features/automations/validation/automation.schemas";
import { describeRule, type NameBook } from "@/features/automations/lib/engine";

// The When / If / Then builder (31_automations.md §6).
//
// Three stacked sections in that order, because that is the shape Jira, ClickUp
// and Asana all use and the mental model people already have. Inventing a
// different arrangement would buy nothing and cost every user their intuition.

export interface BuilderOptions {
  statuses: WorkflowStatusDto[];
  members: { userId: string; name: string }[];
  labels: LabelDto[];
}

const TRIGGER_LABEL: Record<AutomationTriggerDto, string> = {
  ISSUE_CREATED: "An issue is created",
  STATUS_CHANGED: "Status changes",
  ASSIGNEE_CHANGED: "The assignee changes",
  PRIORITY_CHANGED: "Priority changes",
};

const CONDITION_LABEL: Record<AutomationConditionKind, string> = {
  TYPE_IS: "Issue type is",
  PRIORITY_IS: "Priority is",
  STATUS_CATEGORY_IS: "Status category is",
  STATUS_IS: "Status is",
  ASSIGNEE_IS: "Assignee is",
  HAS_LABEL: "Has label",
};

const ACTION_LABEL: Record<AutomationActionKind, string> = {
  SET_STATUS: "Move to status",
  ASSIGN: "Assign to",
  SET_PRIORITY: "Set priority to",
  ADD_COMMENT: "Post a comment",
  NOTIFY: "Notify",
};

const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] as const;
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const;

const pretty = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

/** A blank condition of each kind — what "Add condition" starts you with. */
function blankCondition(kind: AutomationConditionKind, o: BuilderOptions): AutomationCondition {
  switch (kind) {
    case "TYPE_IS":
      return { kind, types: ["BUG"] };
    case "PRIORITY_IS":
      return { kind, priorities: ["HIGHEST"] };
    case "STATUS_CATEGORY_IS":
      return { kind, categories: ["DONE"] };
    case "STATUS_IS":
      return { kind, statusIds: o.statuses[0] ? [o.statuses[0].id] : [] };
    case "ASSIGNEE_IS":
      return { kind, userIds: [null] };
    case "HAS_LABEL":
      return { kind, labelIds: o.labels[0] ? [o.labels[0].id] : [] };
  }
}

function blankAction(kind: AutomationActionKind, o: BuilderOptions): AutomationAction {
  switch (kind) {
    case "SET_STATUS":
      return { kind, statusId: o.statuses[0]?.id ?? "" };
    case "ASSIGN":
      return { kind, userId: o.members[0]?.userId ?? null };
    case "SET_PRIORITY":
      return { kind, priority: "HIGH" };
    case "ADD_COMMENT":
      return { kind, body: "" };
    case "NOTIFY":
      return { kind, target: "ASSIGNEE" };
  }
}

/** A multi-select rendered as toggle chips — no new primitive, and it reads. */
function Chips<T extends string | null>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() =>
              onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionRow({
  condition,
  options,
  onChange,
  onRemove,
}: {
  condition: AutomationCondition;
  options: BuilderOptions;
  onChange: (next: AutomationCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={condition.kind}
          onValueChange={(kind) =>
            onChange(blankCondition(kind as AutomationConditionKind, options))
          }
        >
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CONDITION_LABEL) as AutomationConditionKind[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {CONDITION_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={onRemove}
          aria-label="Remove condition"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {condition.kind === "TYPE_IS" && (
        <Chips
          options={ISSUE_TYPES.map((t) => ({ value: t, label: pretty(t) }))}
          selected={condition.types}
          onChange={(types) => onChange({ ...condition, types })}
        />
      )}
      {condition.kind === "PRIORITY_IS" && (
        <Chips
          options={PRIORITIES.map((p) => ({ value: p, label: pretty(p) }))}
          selected={condition.priorities}
          onChange={(priorities) => onChange({ ...condition, priorities })}
        />
      )}
      {condition.kind === "STATUS_CATEGORY_IS" && (
        <Chips
          options={STATUS_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          selected={condition.categories}
          onChange={(categories) => onChange({ ...condition, categories })}
        />
      )}
      {condition.kind === "STATUS_IS" && (
        <Chips
          options={options.statuses.map((s) => ({ value: s.id, label: s.name }))}
          selected={condition.statusIds}
          onChange={(statusIds) => onChange({ ...condition, statusIds })}
        />
      )}
      {condition.kind === "ASSIGNEE_IS" && (
        <Chips<string | null>
          // "Unassigned" is offered as a value, not as a separate control: it is
          // a real state people build rules around, and hiding it behind a
          // checkbox would make the commonest triage rule hard to express.
          options={[
            { value: null, label: "Unassigned" },
            ...options.members.map((m) => ({ value: m.userId, label: m.name })),
          ]}
          selected={condition.userIds}
          onChange={(userIds) => onChange({ ...condition, userIds })}
        />
      )}
      {condition.kind === "HAS_LABEL" &&
        (options.labels.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This organisation has no labels yet — add some in project settings first.
          </p>
        ) : (
          <Chips
            options={options.labels.map((l) => ({ value: l.id, label: l.name }))}
            selected={condition.labelIds}
            onChange={(labelIds) => onChange({ ...condition, labelIds })}
          />
        ))}
    </div>
  );
}

function ActionRow({
  action,
  options,
  onChange,
  onRemove,
}: {
  action: AutomationAction;
  options: BuilderOptions;
  onChange: (next: AutomationAction) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={action.kind}
          onValueChange={(kind) => onChange(blankAction(kind as AutomationActionKind, options))}
        >
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_LABEL) as AutomationActionKind[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {ACTION_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={onRemove}
          aria-label="Remove action"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {action.kind === "SET_STATUS" && (
        <Select
          value={action.statusId}
          onValueChange={(statusId) => onChange({ ...action, statusId })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Choose a status" />
          </SelectTrigger>
          <SelectContent>
            {options.statuses.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action.kind === "ASSIGN" && (
        <Select
          value={action.userId ?? "__none"}
          onValueChange={(v) => onChange({ ...action, userId: v === "__none" ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" className="text-xs">
              Nobody (unassign)
            </SelectItem>
            {options.members.map((m) => (
              <SelectItem key={m.userId} value={m.userId} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action.kind === "SET_PRIORITY" && (
        <Select
          value={action.priority}
          onValueChange={(v) =>
            onChange({ ...action, priority: v as (typeof PRIORITIES)[number] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {pretty(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action.kind === "ADD_COMMENT" && (
        <Textarea
          value={action.body}
          onChange={(e) => onChange({ ...action, body: e.target.value })}
          rows={3}
          maxLength={2000}
          placeholder="What the rule should post — e.g. “Escalated. Follow the incident checklist.”"
          className="text-xs"
        />
      )}
      {action.kind === "NOTIFY" && (
        <div className="flex gap-2">
          <Select
            value={action.target}
            onValueChange={(v) =>
              onChange({
                kind: "NOTIFY",
                target: v as "ASSIGNEE" | "REPORTER" | "USER",
                ...(v === "USER" ? { userId: options.members[0]?.userId } : {}),
              })
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ASSIGNEE" className="text-xs">
                The assignee
              </SelectItem>
              <SelectItem value="REPORTER" className="text-xs">
                The reporter
              </SelectItem>
              <SelectItem value="USER" className="text-xs">
                A specific person
              </SelectItem>
            </SelectContent>
          </Select>
          {action.target === "USER" && (
            <Select
              value={action.userId ?? ""}
              onValueChange={(userId) => onChange({ ...action, userId })}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {options.members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  word,
  hint,
  children,
}: {
  word: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{word}</h3>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  );
}

export function RuleBuilder({
  open,
  rule,
  options,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The rule being edited, or null for a new one. */
  rule: AutomationRuleDto | null;
  options: BuilderOptions;
  saving: boolean;
  onSave: (input: {
    name: string;
    trigger: AutomationTriggerDto;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState<AutomationTriggerDto>(rule?.trigger ?? "ISSUE_CREATED");
  const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions ?? []);
  const [actions, setActions] = useState<AutomationAction[]>(
    rule?.actions.length ? rule.actions : [blankAction("SET_PRIORITY", options)],
  );

  const names: NameBook = useMemo(
    () => ({
      statuses: Object.fromEntries(options.statuses.map((s) => [s.id, s.name])),
      users: Object.fromEntries(options.members.map((m) => [m.userId, m.name])),
      labels: Object.fromEntries(options.labels.map((l) => [l.id, l.name])),
    }),
    [options],
  );

  // The same sentence the rule list will show, live. A builder that only tells
  // you what you built after you save it is a builder people misconfigure.
  const summary = describeRule({ trigger, conditions, actions }, names);

  // Mirrors the server's schema rather than trusting it to explain itself
  // afterwards: an empty selection is a half-configured rule, not "match
  // everything", and a comment action with no text posts nothing.
  const problem = useMemo(() => {
    if (!name.trim()) return "Give the rule a name.";
    if (actions.length === 0) return "Add at least one action.";
    for (const c of conditions) {
      const empty =
        (c.kind === "TYPE_IS" && c.types.length === 0) ||
        (c.kind === "PRIORITY_IS" && c.priorities.length === 0) ||
        (c.kind === "STATUS_CATEGORY_IS" && c.categories.length === 0) ||
        (c.kind === "STATUS_IS" && c.statusIds.length === 0) ||
        (c.kind === "ASSIGNEE_IS" && c.userIds.length === 0) ||
        (c.kind === "HAS_LABEL" && c.labelIds.length === 0);
      if (empty) return `Pick at least one value for “${CONDITION_LABEL[c.kind]}”.`;
    }
    for (const a of actions) {
      if (a.kind === "ADD_COMMENT" && !a.body.trim()) return "Write the comment to post.";
      if (a.kind === "SET_STATUS" && !a.statusId) return "Choose the status to move to.";
      if (a.kind === "NOTIFY" && a.target === "USER" && !a.userId) {
        return "Choose who to notify.";
      }
    }
    return null;
  }, [name, conditions, actions]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] w-[min(680px,94vw)] overflow-y-auto">
        <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a trigger, optional conditions, and the actions to run.
        </DialogDescription>

        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="rule-name" className="mb-1.5 block text-xs font-medium">
              Name
            </label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Escalate incoming bugs"
            />
          </div>

          <Section word="When" hint="the one thing that starts this rule">
            <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationTriggerDto)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRIGGER_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          <Section word="If" hint="all of these must be true — leave empty to run every time">
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <ConditionRow
                  key={i}
                  condition={c}
                  options={options}
                  onChange={(next) =>
                    setConditions(conditions.map((x, j) => (j === i ? next : x)))
                  }
                  onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={conditions.length >= MAX_CONDITIONS_PER_RULE}
                onClick={() => setConditions([...conditions, blankCondition("TYPE_IS", options)])}
              >
                <Plus className="mr-1 size-3.5" />
                Add condition
              </Button>
            </div>
          </Section>

          <Section word="Then" hint="run in this order">
            <div className="space-y-2">
              {actions.map((a, i) => (
                <ActionRow
                  key={i}
                  action={a}
                  options={options}
                  onChange={(next) => setActions(actions.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setActions(actions.filter((_, j) => j !== i))}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actions.length >= MAX_ACTIONS_PER_RULE}
                onClick={() => setActions([...actions, blankAction("ADD_COMMENT", options)])}
              >
                <Plus className="mr-1 size-3.5" />
                Add action
              </Button>
            </div>
          </Section>

          <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {problem && <p className="mr-auto text-xs text-destructive">{problem}</p>}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(problem) || saving}
            onClick={() => onSave({ name: name.trim(), trigger, conditions, actions })}
          >
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
