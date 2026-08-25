"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { PageHeader } from "@/shared/components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import type { CodeConnectionDto } from "@/features/code-integration/types/code-integration.types";

// Admin → Code (34_code_integration.md §6).
//
// The screen exists to get somebody through a five-minute setup in another
// product's UI. So the two things they need to paste — the webhook URL and the
// secret — appear together, at the moment they are needed, alongside the exact
// checkboxes to tick on the other side.

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy — select the text and copy it manually.");
            }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return "no events yet";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function CodeConnectionsAdmin({ initial }: { initial: CodeConnectionDto[] }) {
  const [connections, setConnections] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("GitLab");
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com");
  const [revealed, setRevealed] = useState<
    (CodeConnectionDto & { secret: string }) | null
  >(null);

  const load = useCallback(async () => {
    try {
      setConnections(await apiRequest<CodeConnectionDto[]>("/api/admin/code-connections"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load connections.");
    }
  }, []);

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>, success: string): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await fn();
        await load();
        toast.success(success);
        return result;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  useEffect(() => {
    setConnections(initial);
  }, [initial]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<GitBranch />}
        title="Code"
        subtitle="Connect a git host so branches, commits and merge requests appear on the issues they mention."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-3.5" />
            Add connection
          </Button>
        }
      />

      <section className="rounded-2xl border border-border bg-muted/30 p-5">
        <h2 className="text-sm font-semibold text-foreground">How it works</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Put an issue key — <code className="font-mono text-xs">VWP-123</code> — in a
          branch name, a commit message, or a merge request title or description. It shows
          up on that issue&apos;s Development panel. Nothing to link by hand, and no
          mapping between repositories and projects to maintain: the key already says
          which project it belongs to.
        </p>
      </section>

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <GitBranch className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">No connections yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Add one, then paste the webhook URL and secret into your git host.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className={cn(
                "rounded-2xl border border-border bg-background p-5 shadow-card",
                !connection.active && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{connection.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {connection.provider} · {connection.baseUrl} ·{" "}
                    <span
                      className={cn(
                        !connection.lastEventAt && "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {when(connection.lastEventAt)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={connection.active}
                    disabled={busy}
                    aria-label={`${connection.active ? "Disable" : "Enable"} ${connection.name}`}
                    onCheckedChange={(active) =>
                      void mutate(
                        () =>
                          apiRequest(`/api/admin/code-connections/${connection.id}`, {
                            method: "PATCH",
                            body: { active },
                          }),
                        active ? "Connection enabled." : "Connection disabled.",
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy}
                    aria-label={`Delete ${connection.name}`}
                    onClick={() =>
                      void mutate(
                        () =>
                          apiRequest(`/api/admin/code-connections/${connection.id}`, {
                            method: "DELETE",
                          }),
                        "Connection deleted.",
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {connection.webhookUrl && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <Copyable label="Webhook URL" value={connection.webhookUrl} />
                  <p className="text-[11px] text-muted-foreground">
                    In {connection.provider}, add a webhook with this URL and tick:{" "}
                    <span className="text-foreground">
                      {connection.eventsToEnable.join(", ")}
                    </span>
                    . The secret was shown when the connection was created — delete and
                    recreate the connection if it has been lost.
                  </p>
                </div>
              )}

              {!connection.lastEventAt && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Nothing has arrived yet. Push to a branch whose name contains an issue
                  key to check the wiring.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="w-[min(520px,94vw)]">
          <DialogTitle>Add a code connection</DialogTitle>
          <DialogDescription>
            GitLab today, self-managed or gitlab.com. The provider is a plug-in point, so
            others can be added without changing anything else.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="conn-name" className="mb-1.5 block text-xs font-medium">
                Name
              </label>
              <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="conn-url" className="mb-1.5 block text-xs font-medium">
                Host URL
              </label>
              <Input
                id="conn-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://gitlab.yourcompany.com"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Your GitLab instance. Self-managed is fine.
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !name.trim() || !baseUrl.trim()}
              onClick={async () => {
                const result = await mutate(
                  () =>
                    apiRequest<CodeConnectionDto & { secret: string }>(
                      "/api/admin/code-connections",
                      {
                        method: "POST",
                        body: { name: name.trim(), provider: "GITLAB", baseUrl: baseUrl.trim() },
                      },
                    ),
                  "Connection created.",
                );
                if (result) {
                  setCreating(false);
                  setRevealed(result);
                }
              }}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The setup screen. Both values together, because they are pasted into
          the same form on the other side, within the same minute. */}
      <Dialog open={revealed !== null} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="w-[min(620px,94vw)]">
          <DialogTitle>Finish the setup in {revealed?.provider}</DialogTitle>
          <DialogDescription>
            Add a webhook there with these two values.
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-foreground">
                The secret is shown once. If you lose it, delete this connection and add
                another.
              </p>
            </div>
            {revealed?.webhookUrl && (
              <Copyable label="URL" value={revealed.webhookUrl} />
            )}
            {revealed && <Copyable label="Secret token" value={revealed.secret} />}
            <p className="text-xs text-muted-foreground">
              Tick these triggers:{" "}
              <span className="text-foreground">{revealed?.eventsToEnable.join(", ")}</span>
            </p>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Working…
        </p>
      )}
    </div>
  );
}
