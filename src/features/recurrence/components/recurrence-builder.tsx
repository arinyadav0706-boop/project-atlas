"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
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
import {
  describeSchedule,
  nextOccurrence,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequencyDto,
  type RecurrenceModeDto,
} from "@/features/recurrence/lib/schedule";
import { MAX_INTERVAL } from "@/features/recurrence/validation/recurrence.schemas";
import type { RecurrenceDto } from "@/features/recurrence/types/recurrence.types";

// The recurrence builder (32_recurring.md §6).
//
// Shows the next three dates it would fire, live. A schedule you cannot preview
// is a schedule you find out about on Monday — and "every other Tuesday" is
// exactly the kind of rule people get one week out of phase.

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FREQUENCY_LABEL: Record<RecurrenceFrequencyDto, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

const ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG"] as const;
const PRIORITIES = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] as const;
const pretty = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

/** `YYYY-MM-DD` for a date input. */
const toDateInput = (iso: string) => iso.slice(0, 10);
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromClock = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export interface RecurrenceFormValue {
  name: string;
  mode: RecurrenceModeDto;
  frequency: RecurrenceFrequencyDto;
  interval: number;
  startsOn: string;
  weekdays: number[];
  dayOfMonth: number | null;
  timeOfDay: number;
  timeZone: string;
  skipWeekends: boolean;
  skipIfOpen: boolean;
  intervalDays: number | null;
  title: string;
  description: string | null;
  type: (typeof ISSUE_TYPES)[number];
  priority: (typeof PRIORITIES)[number];
  assigneeId: string | null;
  reporterId?: string;
  dueInDays: number | null;
  endsOn: string | null;
  maxOccurrences: number | null;
}

/** The browser's own zone — the only sensible default (ADR-0051 §7). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function blankRecurrence(over: Partial<RecurrenceFormValue> = {}): RecurrenceFormValue {
  const today = new Date();
  return {
    name: "",
    mode: "FIXED_SCHEDULE",
    frequency: "WEEKLY",
    interval: 1,
    startsOn: today.toISOString(),
    weekdays: [today.getDay()],
    dayOfMonth: today.getDate(),
    timeOfDay: 540,
    timeZone: localTimeZone(),
    skipWeekends: false,
    skipIfOpen: false,
    intervalDays: 7,
    title: "",
    description: null,
    type: "TASK",
    priority: "MEDIUM",
    assigneeId: null,
    dueInDays: null,
    endsOn: null,
    maxOccurrences: null,
    ...over,
  };
}

export function fromDto(dto: RecurrenceDto): RecurrenceFormValue {
  return {
    name: dto.name,
    mode: dto.mode,
    frequency: dto.frequency,
    interval: dto.interval,
    startsOn: dto.startsOn,
    weekdays: dto.weekdays,
    dayOfMonth: dto.dayOfMonth,
    timeOfDay: dto.timeOfDay,
    timeZone: dto.timeZone,
    skipWeekends: dto.skipWeekends,
    skipIfOpen: dto.skipIfOpen,
    intervalDays: dto.intervalDays,
    title: dto.title,
    description: dto.description,
    type: dto.type as (typeof ISSUE_TYPES)[number],
    priority: dto.priority as (typeof PRIORITIES)[number],
    assigneeId: dto.assignee?.id ?? null,
    reporterId: dto.reporter.id,
    dueInDays: dto.dueInDays,
    endsOn: dto.endsOn,
    maxOccurrences: dto.maxOccurrences,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function RecurrenceBuilder({
  open,
  editing,
  members,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The value to start from — a blank template, or one prefilled from an issue. */
  editing: RecurrenceFormValue;
  members: { userId: string; name: string }[];
  saving: boolean;
  onSave: (value: RecurrenceFormValue) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<RecurrenceFormValue>(editing);
  // Read once, when the dialog opens. The preview must not shift under the
  // cursor every time a keystroke re-renders, and a clock read during render
  // is not idempotent.
  const [openedAt] = useState(() => Date.now());
  const set = <K extends keyof RecurrenceFormValue>(key: K, value: RecurrenceFormValue[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const zones = useMemo(() => {
    // `supportedValuesOf` is not in every runtime's lib types yet; the fallback
    // keeps the picker usable rather than empty.
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    const all = supported ? supported("timeZone") : [];
    // "UTC" is NOT in that list — but it is what `resolvedOptions()` returns on
    // a server-ish machine and it is the column's default, so without this the
    // picker renders blank for the commonest starting value. The stored zone is
    // unioned in for the same reason: a value the runtime cannot enumerate must
    // still be shown rather than silently disappearing.
    return [...new Set([...all, "UTC", editing.timeZone, localTimeZone()])].sort();
  }, [editing.timeZone]);

  // The three dates it would actually fire. Computed with the same pure
  // function the server schedules from, so the preview cannot promise a date
  // the scheduler would not pick.
  const preview = useMemo(() => {
    if (v.mode === "AFTER_COMPLETION") return [];
    const rule = {
      frequency: v.frequency,
      interval: v.interval,
      startsOn: new Date(v.startsOn),
      weekdays: v.weekdays,
      dayOfMonth: v.dayOfMonth,
      timeOfDay: v.timeOfDay,
      timeZone: v.timeZone,
      skipWeekends: v.skipWeekends,
      endsOn: v.endsOn ? new Date(v.endsOn) : null,
    };
    const out: Date[] = [];
    let at = new Date(Math.max(openedAt, new Date(v.startsOn).getTime()) - 1);
    for (let i = 0; i < 3; i++) {
      const next = nextOccurrence(rule, at);
      if (!next) break;
      out.push(next);
      at = next;
    }
    return out;
  }, [v, openedAt]);

  const summary =
    v.mode === "AFTER_COMPLETION"
      ? `${v.intervalDays ?? 0} day${v.intervalDays === 1 ? "" : "s"} after the last one is done`
      : describeSchedule({
          frequency: v.frequency,
          interval: v.interval,
          weekdays: v.weekdays,
          dayOfMonth: v.dayOfMonth,
          timeOfDay: v.timeOfDay,
          timeZone: v.timeZone,
          skipWeekends: v.skipWeekends,
          startsOn: new Date(v.startsOn),
        });

  const problem = !v.name.trim()
    ? "Give the recurrence a name."
    : !v.title.trim()
      ? "Give the issue it creates a title."
      : v.mode === "AFTER_COMPLETION" && !v.intervalDays
        ? "Say how many days after completion."
        : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] w-[min(680px,94vw)] overflow-y-auto">
        <DialogTitle>{editing.name ? "Edit recurring work" : "New recurring work"}</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a schedule and the issue it should create each time.
        </DialogDescription>

        <div className="mt-4 space-y-5">
          <Field label="Name" hint="what this schedule is called in settings">
            <Input
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={80}
              placeholder="Monday standup"
            />
          </Field>

          <section className="rounded-xl border border-border p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide">Schedule</h3>
            <div className="space-y-3">
              <Field label="Repeat">
                <Select
                  value={v.mode}
                  onValueChange={(mode) => set("mode", mode as RecurrenceModeDto)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_SCHEDULE" className="text-xs">
                      On a schedule
                    </SelectItem>
                    <SelectItem value="AFTER_COMPLETION" className="text-xs">
                      After the last one is done
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {v.mode === "AFTER_COMPLETION" ? (
                <Field label="Days after completion">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={v.intervalDays ?? ""}
                    onChange={(e) => set("intervalDays", Number(e.target.value) || null)}
                    className="w-28"
                  />
                </Field>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Field label="Every">
                      <Input
                        type="number"
                        min={1}
                        max={MAX_INTERVAL}
                        value={v.interval}
                        onChange={(e) =>
                          set("interval", Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20"
                      />
                    </Field>
                    <Field label="&nbsp;">
                      <Select
                        value={v.frequency}
                        onValueChange={(f) => set("frequency", f as RecurrenceFrequencyDto)}
                      >
                        <SelectTrigger className="h-9 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_FREQUENCIES.map((f) => (
                            <SelectItem key={f} value={f} className="text-xs">
                              {FREQUENCY_LABEL[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {v.frequency === "WEEKLY" && (
                    <Field label="On">
                      <div className="flex gap-1">
                        {DAY_INITIALS.map((initial, day) => {
                          const on = v.weekdays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              aria-label={DAY_NAMES[day]}
                              aria-pressed={on}
                              onClick={() =>
                                set(
                                  "weekdays",
                                  on
                                    ? v.weekdays.filter((d) => d !== day)
                                    : [...v.weekdays, day].sort((a, b) => a - b),
                                )
                              }
                              className={cn(
                                "size-8 rounded-full border text-xs transition-colors",
                                on
                                  ? "border-primary bg-primary/10 font-medium text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {initial}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  )}

                  {v.frequency === "MONTHLY" && (
                    <Field label="On day" hint="the 31st falls back to the last day of short months">
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={v.dayOfMonth ?? 1}
                        onChange={(e) => set("dayOfMonth", Number(e.target.value) || 1)}
                        className="w-20"
                      />
                    </Field>
                  )}

                  {v.frequency === "DAILY" && (
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={v.skipWeekends}
                        onCheckedChange={(c) => set("skipWeekends", c)}
                      />
                      Skip weekends
                    </label>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Field label="Starting">
                      <Input
                        type="date"
                        value={toDateInput(v.startsOn)}
                        onChange={(e) =>
                          set("startsOn", new Date(`${e.target.value}T00:00:00Z`).toISOString())
                        }
                        className="w-40"
                      />
                    </Field>
                    <Field label="At">
                      <Input
                        type="time"
                        value={clock(v.timeOfDay)}
                        onChange={(e) => set("timeOfDay", fromClock(e.target.value))}
                        className="w-32"
                      />
                    </Field>
                    <Field label="Time zone">
                      <Select value={v.timeZone} onValueChange={(z) => set("timeZone", z)}>
                        <SelectTrigger className="h-9 w-56 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {zones.map((z) => (
                            <SelectItem key={z} value={z} className="text-xs">
                              {z}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={v.skipIfOpen}
                      onCheckedChange={(c) => set("skipIfOpen", c)}
                    />
                    Skip if the last one is still open
                  </label>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide">
              The issue it creates
            </h3>
            <div className="space-y-3">
              <Field label="Title">
                <Input
                  value={v.title}
                  onChange={(e) => set("title", e.target.value)}
                  maxLength={200}
                  placeholder="Run the standup"
                />
              </Field>
              <Field label="Description" hint="optional">
                <Textarea
                  value={v.description ?? ""}
                  onChange={(e) => set("description", e.target.value || null)}
                  rows={2}
                  className="text-xs"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Field label="Type">
                  <Select
                    value={v.type}
                    onValueChange={(t) => set("type", t as (typeof ISSUE_TYPES)[number])}
                  >
                    <SelectTrigger className="h-9 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {pretty(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select
                    value={v.priority}
                    onValueChange={(p) => set("priority", p as (typeof PRIORITIES)[number])}
                  >
                    <SelectTrigger className="h-9 w-32 text-xs">
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
                </Field>
                <Field label="Assign to">
                  <Select
                    value={v.assigneeId ?? "__none"}
                    onValueChange={(id) => set("assigneeId", id === "__none" ? null : id)}
                  >
                    <SelectTrigger className="h-9 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">
                        Nobody
                      </SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.userId} value={m.userId} className="text-xs">
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Due in" hint="days">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={v.dueInDays ?? ""}
                    onChange={(e) =>
                      set("dueInDays", e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-24"
                    placeholder="—"
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide">
              Stop after
            </h3>
            <div className="flex flex-wrap gap-2">
              <Field label="This date" hint="optional">
                <Input
                  type="date"
                  value={v.endsOn ? toDateInput(v.endsOn) : ""}
                  onChange={(e) =>
                    set(
                      "endsOn",
                      e.target.value
                        ? new Date(`${e.target.value}T23:59:59Z`).toISOString()
                        : null,
                    )
                  }
                  className="w-40"
                />
              </Field>
              <Field label="This many times" hint="optional">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={v.maxOccurrences ?? ""}
                  onChange={(e) =>
                    set(
                      "maxOccurrences",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  className="w-32"
                  placeholder="—"
                />
              </Field>
            </div>
          </section>

          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <p className="text-[13px] font-medium text-foreground">{summary}</p>
            {preview.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Next:{" "}
                {preview
                  .map((d) =>
                    d.toLocaleString(undefined, {
                      timeZone: v.timeZone,
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  )
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {problem && <p className="mr-auto text-xs text-destructive">{problem}</p>}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={Boolean(problem) || saving} onClick={() => onSave(v)}>
            {editing.name ? "Save changes" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
