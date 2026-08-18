"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
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
import { MAX_VIEW_NAME_LENGTH } from "@/features/saved-views/validation/saved-view.schemas";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type {
  SavedViewDto,
  SavedViewSortDto,
  SavedViewVisibilityDto,
} from "@/features/saved-views/types/saved-view.types";

// Save the current filter as a view, or update the loaded one.
//
// When a view is already loaded and the caller may edit it, the dialog offers
// both: "Update" keeps everyone who uses the shared view pointed at the new
// filter, "Save as new" leaves theirs alone. Making that an explicit choice
// matters once a view is shared — silently rewriting one is how a colleague's
// list changes under them.
export function SaveViewDialog({
  open,
  onOpenChange,
  filter,
  sort,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: IssueFilter;
  sort: SavedViewSortDto;
  existing: SavedViewDto | null;
  onSaved: (view: SavedViewDto, replaced: boolean) => void;
}) {
  const canUpdate = Boolean(existing?.canEdit);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<SavedViewVisibilityDto>("PRIVATE");
  const [busy, setBusy] = useState(false);

  // Seed from the loaded view each time the dialog opens, so reopening after a
  // cancel does not show the previous attempt's text.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setVisibility(existing?.visibility ?? "PRIVATE");
  }, [open, existing]);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_VIEW_NAME_LENGTH;

  async function submit(mode: "create" | "update") {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const view =
        mode === "update" && existing
          ? await apiRequest<SavedViewDto>(`/api/saved-views/${existing.id}`, {
              method: "PATCH",
              body: { name: trimmed, filter, sort, visibility },
            })
          : await apiRequest<SavedViewDto>("/api/saved-views", {
              method: "POST",
              body: { name: trimmed, filter, sort, visibility },
            });
      onSaved(view, mode === "update");
      onOpenChange(false);
      toast.success(mode === "update" ? "View updated." : `Saved "${view.name}".`);
    } catch (error) {
      // A duplicate name is a 409 from the unique index (BR-10); the message
      // comes from the service, so it already says which rule was hit.
      toast.error(error instanceof Error ? error.message : "Couldn't save the view.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{canUpdate ? "Save view" : "Save as new view"}</DialogTitle>
        <DialogDescription>
          Saves the filter and sort you have now. Everyone who opens it still sees
          only the projects they belong to.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              autoFocus
              maxLength={MAX_VIEW_NAME_LENGTH}
              placeholder="My open bugs"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit(canUpdate ? "update" : "create");
              }}
            />
          </div>

          <div>
            <Label htmlFor="view-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as SavedViewVisibilityDto)}
            >
              <SelectTrigger id="view-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private — only me</SelectItem>
                <SelectItem value="SHARED">Shared — everyone in the org</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {canUpdate && (
            <Button variant="outline" onClick={() => submit("create")} disabled={!valid || busy}>
              Save as new
            </Button>
          )}
          <Button
            onClick={() => submit(canUpdate ? "update" : "create")}
            loading={busy}
            disabled={!valid}
          >
            {canUpdate ? "Update view" : "Save view"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
