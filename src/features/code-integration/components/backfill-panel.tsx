"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { providerSetup } from "@/features/code-integration/lib/provider-catalog";
import type {
  BackfillRunDto,
  CodeConnectionDto,
  CodeRepositoryDto,
} from "@/features/code-integration/types/code-integration.types";

// Backfill, per connection (35 §6).
//
// The screen has one job beyond the obvious: make a PAUSED run legible. A
// rate-limited walk is healthy, and showing it as an error sends somebody to
// debug a working system (35/BR-11). So paused reads as "resuming at 14:05",
// in the same tone as "running", and only a genuine failure is red.
//
// No provider names here either — everything provider-shaped comes from the
// catalog, same as the connection picker (34/BR-4).

function relative(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function until(iso: string | null): string {
  if (!iso) return "shortly";
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "any moment";
  if (minutes < 60) return `in ${minutes}m`;
  return `at ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const PHASE_LABEL: Record<BackfillRunDto["phase"], string> = {
  MERGE_REQUESTS: "merge requests",
  BRANCHES: "branches",
  COMMITS: "commits",
  DONE: "finished",
};

function RunLine({ run }: { run: BackfillRunDto }) {
  if (run.status === "SUCCEEDED") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Scanned {run.scanned}, linked {run.linked} · {relative(run.finishedAt)}
      </span>
    );
  }
  if (run.status === "PAUSED") {
    // Not red. A rate limit is the provider working correctly and us being
    // polite about it.
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <PauseCircle className="size-3" />
        Paused for rate limits — resuming {until(run.resumeAfter)} · {run.linked} linked so far
      </span>
    );
  }
  if (run.status === "FAILED") {
    return (
      <span className="flex items-start gap-1.5 text-destructive">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
        {run.error ?? "Failed."}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Clock className="size-3" />
      {run.status === "RUNNING" ? "Scanning" : "Queued"} {PHASE_LABEL[run.phase]} · {run.scanned}{" "}
      scanned, {run.linked} linked
    </span>
  );
}

export function BackfillPanel({ connection }: { connection: CodeConnectionDto }) {
  const setup = providerSetup(connection.provider);
  const [repositories, setRepositories] = useState<CodeRepositoryDto[] | null>(null);
  const [runs, setRuns] = useState<BackfillRunDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ repositories: CodeRepositoryDto[]; runs: BackfillRunDto[] }>(
        `/api/admin/code-connections/${connection.id}/backfill`,
      );
      setRepositories(data.repositories);
      setRuns(data.runs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load backfill status.");
      setRepositories([]);
    }
  }, [connection.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while something is actually moving. A finished screen that keeps
  // hitting the server every three seconds is a screen somebody leaves open all
  // day on a laptop.
  const active = runs.some((run) => ["QUEUED", "RUNNING"].includes(run.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [active, load]);

  if (connection.authMode !== "APP") {
    return (
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div>
          <p className="text-[13px] font-medium text-foreground">
            History isn&apos;t here yet
          </p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Webhooks only link what happens from now on. Connect {setup.label} to scan the
            last {connection.backfillDays} days as well, so issues that already have branches
            and merge requests show them.
          </p>
        </div>
        <Button size="sm" asChild>
          <a href={`/api/admin/code-connections/${connection.id}/authorize`}>
            Connect {setup.label}
          </a>
        </Button>
      </div>
    );
  }

  const enabled = repositories?.filter((repository) => repository.enabled) ?? [];
  const runFor = (repositoryId: string) => runs.find((run) => run.repositoryId === repositoryId);

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-foreground">Backfill</p>
          <p className="text-xs text-muted-foreground">
            {connection.connectedAccount
              ? `Connected as ${connection.connectedAccount} · `
              : ""}
            last {connection.backfillDays} days
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                setRepositories(
                  await apiRequest<CodeRepositoryDto[]>(
                    `/api/admin/code-connections/${connection.id}/repositories?refresh=1`,
                  ),
                );
                toast.success("Repository list refreshed.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't reach the host.");
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 size-3.5" />
            )}
            Refresh list
          </Button>
          <Button
            size="sm"
            disabled={busy || enabled.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await apiRequest<{ queued: number }>(
                  `/api/admin/code-connections/${connection.id}/backfill`,
                  { method: "POST" },
                );
                toast.success(
                  result.queued === 0
                    ? "Already running."
                    : `Scanning ${result.queued} ${result.queued === 1 ? "repository" : "repositories"}.`,
                );
                await load();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't start.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            Backfill now
          </Button>
        </div>
      </div>

      {repositories === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </p>
      ) : repositories.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No repositories yet. Refresh the list to see what this install can reach — if it is
          empty, the app was installed without granting access to any.
        </p>
      ) : (
        <ul className="space-y-1">
          {repositories.map((repository) => {
            const run = runFor(repository.id);
            return (
              <li
                key={repository.id}
                className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={repository.enabled}
                  aria-label={`Scan ${repository.path}`}
                  onCheckedChange={async (checked) => {
                    // Optimistic: the checkbox is the whole interaction, and a
                    // round-trip before it moves feels broken.
                    setRepositories((current) =>
                      (current ?? []).map((row) =>
                        row.id === repository.id ? { ...row, enabled: checked === true } : row,
                      ),
                    );
                    try {
                      await apiRequest(
                        `/api/admin/code-connections/${connection.id}/repositories`,
                        { method: "PATCH", body: { ids: [repository.id], enabled: checked === true } },
                      );
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Didn't save.");
                      await load();
                    }
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] text-foreground">
                    {repository.path}
                  </span>
                  <span className="mt-0.5 block text-[11px]">
                    {run ? (
                      <RunLine run={run} />
                    ) : (
                      <span className="text-muted-foreground">
                        {repository.lastBackfillAt
                          ? `Last scanned ${relative(repository.lastBackfillAt)}`
                          : "Never scanned"}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Link2 className="size-3" />
          Links appear on the issues the history mentions — nothing to map.
        </span>
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={async () => {
            if (!confirm(`Disconnect ${setup.label}? Existing links stay; no new history is read.`))
              return;
            try {
              await apiRequest(`/api/admin/code-connections/${connection.id}/credential`, {
                method: "DELETE",
              });
              toast.success(
                `Disconnected. Remove the app in ${setup.label} too if you want the access gone.`,
              );
              window.location.reload();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Couldn't disconnect.");
            }
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
