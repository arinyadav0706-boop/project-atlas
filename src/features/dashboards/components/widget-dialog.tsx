"use client";

import { useEffect, useState } from "react";
import { BarChart3, Hash, List } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { CustomFieldFilters } from "@/features/custom-fields/components/custom-field-filters";
import type { CustomFieldDefinitionDto } from "@/features/custom-fields/types/custom-field.types";
import {
  IssueFilterBar,
  type ProjectOption,
} from "@/features/saved-views/components/issue-filter-bar";
import type { SavedViewDto } from "@/features/saved-views/types/saved-view.types";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { MAX_WIDGET_TITLE } from "@/features/dashboards/validation/dashboard.schemas";
import type {
  BreakdownByDto,
  DashboardWidgetDto,
  WidgetTypeDto,
  WidgetWidthDto,
} from "@/features/dashboards/types/dashboard.types";

// Add or edit one widget (25_dashboards.md §5).
//
// The source is an explicit either/or — a filter you build here, or a saved
// view read live — because BR-4 says a widget carries one, not both. Making it
// a choice in the UI is what stops someone setting a filter, pointing at a
// view, and then wondering which one won.

const TYPES: { value: WidgetTypeDto; label: string; hint: string; icon: typeof Hash }[] = [
  { value: "STAT", label: "Number", hint: "One count", icon: Hash },
  { value: "BREAKDOWN", label: "Breakdown", hint: "Grouped bars", icon: BarChart3 },
  { value: "LIST", label: "List", hint: "Top 10 issues", icon: List },
];

const WIDTHS: { value: WidgetWidthDto; label: string }[] = [
  { value: "SMALL", label: "1 column" },
  { value: "MEDIUM", label: "2 columns" },
  { value: "LARGE", label: "Full width" },
];

const BREAKDOWNS: { value: BreakdownByDto; label: string }[] = [
  { value: "STATUS", label: "Status" },
  { value: "PRIORITY", label: "Priority" },
  { value: "TYPE", label: "Type" },
  { value: "ASSIGNEE", label: "Assignee" },
];

/** What the dialog hands back — no id yet when the widget is new. */
export interface WidgetDraft {
  id?: string;
  title: string;
  type: WidgetTypeDto;
  width: WidgetWidthDto;
  filter: IssueFilter;
  savedViewId: string | null;
  breakdownBy: BreakdownByDto | null;
}

const BLANK: WidgetDraft = {
  title: "",
  type: "STAT",
  width: "SMALL",
  filter: {},
  savedViewId: null,
  breakdownBy: null,
};

export function WidgetDialog({
  open,
  onOpenChange,
  widget,
  projects,
  currentUserId,
  savedViews,
  filterableFields,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null adds a new widget; a widget edits that one. */
  widget: DashboardWidgetDto | null;
  projects: ProjectOption[];
  currentUserId: string;
  savedViews: SavedViewDto[];
  filterableFields: CustomFieldDefinitionDto[];
  onSave: (draft: WidgetDraft) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<WidgetDraft>(BLANK);
  const [source, setSource] = useState<"filter" | "view">("filter");

  // Seed each time it opens, so cancelling then reopening does not show the
  // abandoned attempt.
  useEffect(() => {
    if (!open) return;
    setDraft(
      widget
        ? {
            id: widget.id,
            title: widget.title,
            type: widget.type,
            width: widget.width,
            filter: widget.filter,
            savedViewId: widget.savedViewId,
            breakdownBy: widget.breakdownBy,
          }
        : BLANK,
    );
    setSource(widget?.savedViewId ? "view" : "filter");
  }, [open, widget]);

  function patch(next: Partial<WidgetDraft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  const trimmed = draft.title.trim();
  const valid =
    trimmed.length > 0 &&
    trimmed.length <= MAX_WIDGET_TITLE &&
    (draft.type === "BREAKDOWN" ? Boolean(draft.breakdownBy) : true) &&
    (source === "view" ? Boolean(draft.savedViewId) : true);

  function submit() {
    if (!valid) return;
    onSave({
      ...draft,
      title: trimmed,
      // The unchosen source is cleared here rather than left to the server, so
      // what the dialog showed is exactly what gets stored.
      savedViewId: source === "view" ? draft.savedViewId : null,
      filter: source === "view" ? {} : draft.filter,
      breakdownBy: draft.type === "BREAKDOWN" ? draft.breakdownBy : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{widget ? "Edit card" : "Add a card"}</DialogTitle>
        <DialogDescription>
          A card is a saved question about your issues. Everyone who opens this
          dashboard still sees only the projects they belong to.
        </DialogDescription>

        <div className="mt-5 max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1.5 block">Card type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const active = draft.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      patch({
                        type: t.value,
                        breakdownBy:
                          t.value === "BREAKDOWN" ? (draft.breakdownBy ?? "STATUS") : null,
                        // A breakdown or a list needs room; a number does not.
                        width:
                          t.value === "STAT"
                            ? "SMALL"
                            : draft.width === "SMALL"
                              ? "MEDIUM"
                              : draft.width,
                      })
                    }
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent bg-accent/10"
                        : "border-border bg-background hover:bg-muted/60",
                    )}
                  >
                    <t.icon
                      className={cn(
                        "h-4 w-4",
                        active ? "text-accent" : "text-muted-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        active ? "text-accent" : "text-foreground",
                      )}
                    >
                      {t.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="widget-title">Title</Label>
              <Input
                id="widget-title"
                value={draft.title}
                autoFocus
                maxLength={MAX_WIDGET_TITLE}
                placeholder="Open bugs"
                onChange={(e) => patch({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            </div>

            <div>
              <Label htmlFor="widget-width">Size</Label>
              <Select
                value={draft.width}
                onValueChange={(v) => patch({ width: v as WidgetWidthDto })}
              >
                <SelectTrigger id="widget-width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIDTHS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {draft.type === "BREAKDOWN" && (
            <div>
              <Label htmlFor="widget-breakdown">Group by</Label>
              <Select
                value={draft.breakdownBy ?? "STATUS"}
                onValueChange={(v) => patch({ breakdownBy: v as BreakdownByDto })}
              >
                <SelectTrigger id="widget-breakdown">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAKDOWNS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">What it counts</Label>
            <div className="mb-3 inline-flex rounded-xl border border-border p-0.5">
              <SourceTab
                active={source === "filter"}
                onClick={() => setSource("filter")}
                label="Build a filter"
              />
              <SourceTab
                active={source === "view"}
                onClick={() => setSource("view")}
                label="Use a saved view"
              />
            </div>

            {source === "view" ? (
              savedViews.length === 0 ? (
                <p className="rounded-xl bg-muted/50 px-3 py-4 text-[13px] text-muted-foreground">
                  You have no saved views yet. Save one from the Issues page, or
                  build a filter here instead.
                </p>
              ) : (
                <>
                  <Select
                    value={draft.savedViewId ?? ""}
                    onValueChange={(v) => patch({ savedViewId: v })}
                  >
                    <SelectTrigger aria-label="Saved view">
                      <SelectValue placeholder="Choose a view…" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedViews.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.visibility === "SHARED" ? " · shared" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Read live — editing the view updates this card.
                  </p>
                </>
              )
            ) : (
              <div className="space-y-3">
                <IssueFilterBar
                  filter={draft.filter}
                  projects={projects}
                  currentUserId={currentUserId}
                  onChange={(filter) => patch({ filter })}
                />
                <CustomFieldFilters
                  fields={filterableFields}
                  predicates={draft.filter.customFields ?? []}
                  onChange={(customFields) =>
                    patch({
                      filter: {
                        ...draft.filter,
                        customFields: customFields.length ? customFields : undefined,
                      },
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          {onDelete && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              Remove card
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {widget ? "Save card" : "Add card"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
