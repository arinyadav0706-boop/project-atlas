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
import { MAX_DASHBOARD_NAME } from "@/features/dashboards/validation/dashboard.schemas";
import type {
  DashboardDto,
  DashboardVisibilityDto,
} from "@/features/dashboards/types/dashboard.types";

// Create a dashboard, or rename / re-share an existing one.
//
// Sharing is read-only for everybody else (BR-2), and the copy says so —
// "shared" in most tools quietly means "editable by anyone who finds it", and
// that ambiguity is what makes people afraid to share at all.
export function DashboardDialog({
  open,
  onOpenChange,
  dashboard,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates; a dashboard edits that one. */
  dashboard: DashboardDto | null;
  onSaved: (dashboard: DashboardDto, created: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<DashboardVisibilityDto>("PRIVATE");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(dashboard?.name ?? "");
    setVisibility(dashboard?.visibility ?? "PRIVATE");
  }, [open, dashboard]);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_DASHBOARD_NAME;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const saved = dashboard
        ? await apiRequest<DashboardDto>(`/api/dashboards/${dashboard.id}`, {
            method: "PATCH",
            body: { name: trimmed, visibility },
          })
        : await apiRequest<DashboardDto>("/api/dashboards", {
            method: "POST",
            body: { name: trimmed, visibility },
          });
      onSaved(saved, !dashboard);
      onOpenChange(false);
    } catch (error) {
      // A duplicate name is a 409 with its own message (BR-9).
      toast.error(error instanceof Error ? error.message : "Couldn't save the dashboard.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{dashboard ? "Dashboard settings" : "New dashboard"}</DialogTitle>
        <DialogDescription>
          Cards are added once the dashboard exists.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="dashboard-name">Name</Label>
            <Input
              id="dashboard-name"
              value={name}
              autoFocus
              maxLength={MAX_DASHBOARD_NAME}
              placeholder="Delivery health"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>

          <div>
            <Label htmlFor="dashboard-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as DashboardVisibilityDto)}
            >
              <SelectTrigger id="dashboard-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private — only me</SelectItem>
                <SelectItem value="SHARED">Shared — everyone can view</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Shared dashboards are read-only for everyone but you, and each
              person sees only the projects they belong to.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>
            {dashboard ? "Save" : "Create dashboard"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
