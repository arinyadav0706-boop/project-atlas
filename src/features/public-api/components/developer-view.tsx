"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  History,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { usePagination } from "@/shared/hooks/use-pagination";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import {
  API_SCOPES,
  EVENT_DESCRIPTION,
  SCOPE_DESCRIPTION,
  WEBHOOK_EVENTS,
  type ApiScope,
  type CreatedApiTokenDto,
  type DeveloperSettingsDto,
  type WebhookDeliveryDto,
  type WebhookDto,
  type WebhookEvent,
} from "@/features/public-api/types/public-api.types";

function when(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** The one screen where a secret is visible. */
function SecretOnce({
  title,
  description,
  secret,
  onClose,
}: {
  title: string;
  description: string;
  secret: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(560px,94vw)]">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-foreground">
              Copy this now — it will never be shown again. If you lose it, revoke this
              one and create another.
            </p>
          </div>
          <CopyField value={secret} label="secret" />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>I&apos;ve copied it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onChange,
  describe,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  describe: Record<T, string>;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? selected.filter((s) => s !== option) : [...selected, option])
            }
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
              on ? "border-accent bg-accent/10" : "border-border hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                on ? "border-accent bg-accent text-accent-foreground" : "border-border",
              )}
            >
              {on && <Check className="size-3" />}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-xs text-foreground">{option}</span>
              <span className="block text-[11px] text-muted-foreground">
                {describe[option]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Card({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs backdrop-blur-sm transition-all hover:border-border">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TokenList({
  tokens,
  busy,
  onRevoke,
}: {
  tokens: DeveloperSettingsDto["tokens"];
  busy: boolean;
  onRevoke: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.hint.toLowerCase().includes(q) ||
        t.scopes.some((s) => s.toLowerCase().includes(q)),
    );
  }, [tokens, search]);

  const { paginatedItems, paginationProps } = usePagination({
    items: filtered,
    initialPageSize: 5,
    itemLabel: "tokens",
    resetDeps: [search],
  });

  if (tokens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
        No tokens yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tokens.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter tokens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      {paginatedItems.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No matching tokens found.</p>
      ) : (
        <ul className="space-y-2">
          {paginatedItems.map((token) => (
            <li
              key={token.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-surface/50 p-3 transition-colors hover:border-border",
                token.revokedAt && "opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {token.name}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    …{token.hint}
                  </code>
                  {token.revokedAt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      Revoked
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {token.scopes.join(" · ")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Last used {when(token.lastUsedAt)}
                  {token.expiresAt &&
                    ` · expires ${new Date(token.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              {!token.revokedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Revoke ${token.name}`}
                  onClick={() => onRevoke(token.id, token.name)}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 5 && (
        <div className="pt-2 border-t border-border/50">
          <DataPagination {...paginationProps} />
        </div>
      )}
    </div>
  );
}

function WebhookList({
  webhooks,
  busy,
  onToggleActive,
  onOpenDeliveries,
  onDelete,
}: {
  webhooks: DeveloperSettingsDto["webhooks"];
  busy: boolean;
  onToggleActive: (hook: WebhookDto, active: boolean) => void;
  onOpenDeliveries: (hook: WebhookDto) => void;
  onDelete: (hook: WebhookDto) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return webhooks;
    return webhooks.filter(
      (h) =>
        h.url.toLowerCase().includes(q) ||
        h.events.some((e) => e.toLowerCase().includes(q)),
    );
  }, [webhooks, search]);

  const { paginatedItems, paginationProps } = usePagination({
    items: filtered,
    initialPageSize: 5,
    itemLabel: "webhooks",
    resetDeps: [search],
  });

  if (webhooks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
        No webhooks yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {webhooks.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter webhooks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      {paginatedItems.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No matching webhooks found.</p>
      ) : (
        <ul className="space-y-2">
          {paginatedItems.map((hook) => (
            <li
              key={hook.id}
              className={cn(
                "rounded-xl border border-border/80 bg-surface/50 p-3 transition-colors hover:border-border",
                !hook.active && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-foreground font-medium">
                    {hook.url}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {hook.events.join(" · ")}
                  </p>
                  {hook.disabledReason && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {hook.disabledReason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={hook.active}
                    disabled={busy}
                    aria-label={`${hook.active ? "Disable" : "Enable"} ${hook.url}`}
                    onCheckedChange={(active) => onToggleActive(hook, active)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Deliveries for ${hook.url}`}
                    onClick={() => onOpenDeliveries(hook)}
                  >
                    <History className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${hook.url}`}
                    disabled={busy}
                    onClick={() => onDelete(hook)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 5 && (
        <div className="pt-2 border-t border-border/50">
          <DataPagination {...paginationProps} />
        </div>
      )}
    </div>
  );
}

function DeliveriesDialog({
  deliveries,
  onClose,
}: {
  deliveries: { webhook: WebhookDto; rows: WebhookDeliveryDto[] | null } | null;
  onClose: () => void;
}) {
  const rows = deliveries?.rows ?? [];
  const { paginatedItems, paginationProps } = usePagination({
    items: rows,
    initialPageSize: 8,
    itemLabel: "deliveries",
    resetDeps: [deliveries?.webhook.id],
  });

  return (
    <Dialog open={deliveries !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-[min(680px,94vw)] flex flex-col">
        <DialogTitle>Deliveries</DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">
          {deliveries?.webhook.url}
        </DialogDescription>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 py-2 custom-scrollbar">
          {deliveries?.rows === null && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
          )}
          {deliveries?.rows?.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nothing delivered yet.
            </p>
          )}
          {paginatedItems.map((row) => (
            <div
              key={row.id}
              className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-card p-3 text-xs"
            >
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  row.status === "SUCCEEDED" &&
                    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  row.status === "PENDING" && "bg-muted text-muted-foreground",
                  row.status === "FAILED" && "bg-destructive/10 text-destructive",
                )}
              >
                {row.status === "SUCCEEDED"
                  ? "Delivered"
                  : row.status === "PENDING"
                    ? "Retrying"
                    : "Failed"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-medium text-foreground">{row.event}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.responseCode ? `HTTP ${row.responseCode}` : "No response"}
                  {row.attempts > 1 && ` · attempt ${row.attempts}`}
                  {row.error && ` · ${row.error}`}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {when(row.createdAt)}
              </span>
            </div>
          ))}
        </div>

        {rows.length > 8 && (
          <div className="border-t border-border/60 pt-2">
            <DataPagination {...paginationProps} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeveloperView({ baseUrl }: { baseUrl: string }) {
  const [data, setData] = useState<DeveloperSettingsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [revealed, setRevealed] = useState<{ title: string; description: string; secret: string } | null>(
    null,
  );
  const [deliveries, setDeliveries] = useState<{
    webhook: WebhookDto;
    rows: WebhookDeliveryDto[] | null;
  } | null>(null);

  // Token form.
  const [tokenName, setTokenName] = useState("");
  const [tokenScopes, setTokenScopes] = useState<ApiScope[]>(["issues:read"]);
  const [tokenExpiry, setTokenExpiry] = useState("90");

  // Webhook form.
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>(["issue.created"]);

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<DeveloperSettingsDto>("/api/developer/tokens"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load developer settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<KeyRound />}
        title="Developer"
        subtitle="Tokens for the REST API, and webhooks so your systems hear about changes instead of polling for them."
      />

      <section className="rounded-2xl border border-border/80 bg-muted/30 p-5 shadow-2xs">
        <h2 className="text-sm font-semibold text-foreground">Getting started</h2>
        <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">
          Create a token below, then:
        </p>
        <CopyField
          value={`curl -H "Authorization: Bearer eag_…" ${baseUrl}/api/v1/me`}
          label="example request"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Every list is cursor-paginated and every response carries your remaining rate
          budget in <code className="font-mono">X-RateLimit-Remaining</code>.
        </p>
      </section>

      <Card
        icon={<KeyRound />}
        title="API tokens"
        description="Personal. A token can do exactly what you can do — never more — narrowed further by its scopes."
        action={
          <Button size="sm" onClick={() => setCreatingToken(true)}>
            <Plus className="mr-1 size-3.5" />
            New token
          </Button>
        }
      >
        <TokenList
          tokens={data.tokens}
          busy={busy}
          onRevoke={(id) =>
            void mutate(
              () => apiRequest(`/api/developer/tokens/${id}`, { method: "DELETE" }),
              "Token revoked.",
            )
          }
        />
      </Card>

      {data.canManageWebhooks && (
        <Card
          icon={<WebhookIcon />}
          title="Webhooks"
          description="We POST to your URL when something changes, signed so you can prove it came from us. Failed deliveries are retried, and a dead endpoint is switched off rather than hammered."
          action={
            <Button size="sm" onClick={() => setCreatingWebhook(true)}>
              <Plus className="mr-1 size-3.5" />
              New webhook
            </Button>
          }
        >
          <WebhookList
            webhooks={data.webhooks}
            busy={busy}
            onToggleActive={(hook, active) =>
              void mutate(
                () =>
                  apiRequest(`/api/developer/webhooks/${hook.id}`, {
                    method: "PATCH",
                    body: { active },
                  }),
                active ? "Webhook enabled." : "Webhook disabled.",
              )
            }
            onOpenDeliveries={async (hook) => {
              setDeliveries({ webhook: hook, rows: null });
              try {
                setDeliveries({
                  webhook: hook,
                  rows: await apiRequest<WebhookDeliveryDto[]>(
                    `/api/developer/webhooks/${hook.id}/deliveries`,
                  ),
                });
              } catch {
                toast.error("Couldn't load deliveries.");
                setDeliveries(null);
              }
            }}
            onDelete={(hook) =>
              void mutate(
                () =>
                  apiRequest(`/api/developer/webhooks/${hook.id}`, {
                    method: "DELETE",
                  }),
                "Webhook deleted.",
              )
            }
          />
        </Card>
      )}

      {/* ── New token ── */}
      <Dialog open={creatingToken} onOpenChange={(o) => !o && setCreatingToken(false)}>
        <DialogContent className="max-h-[88vh] w-[min(560px,94vw)] overflow-y-auto">
          <DialogTitle>New API token</DialogTitle>
          <DialogDescription>
            It will be able to do what you can do, limited to the scopes you pick.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="token-name" className="mb-1.5 block text-xs font-medium">
                What is it for?
              </label>
              <Input
                id="token-name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                maxLength={60}
                placeholder="Nightly export script"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">Scopes</p>
              <Chips
                options={API_SCOPES}
                selected={tokenScopes}
                onChange={setTokenScopes}
                describe={SCOPE_DESCRIPTION}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Expires</label>
              <Select value={tokenExpiry} onValueChange={setTokenExpiry}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">In 30 days</SelectItem>
                  <SelectItem value="90">In 90 days</SelectItem>
                  <SelectItem value="365">In a year</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreatingToken(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !tokenName.trim() || tokenScopes.length === 0}
              onClick={async () => {
                const result = await mutate(
                  () =>
                    apiRequest<CreatedApiTokenDto>("/api/developer/tokens", {
                      method: "POST",
                      body: {
                        name: tokenName.trim(),
                        scopes: tokenScopes,
                        expiresInDays: tokenExpiry === "never" ? null : Number(tokenExpiry),
                      },
                    }),
                  "Token created.",
                );
                if (result) {
                  setCreatingToken(false);
                  setTokenName("");
                  setRevealed({
                    title: "Your new token",
                    description: "Send it as `Authorization: Bearer <token>`.",
                    secret: result.plaintext,
                  });
                }
              }}
            >
              Create token
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New webhook ── */}
      <Dialog open={creatingWebhook} onOpenChange={(o) => !o && setCreatingWebhook(false)}>
        <DialogContent className="max-h-[88vh] w-[min(560px,94vw)] overflow-y-auto">
          <DialogTitle>New webhook</DialogTitle>
          <DialogDescription>
            We&apos;ll POST a signed JSON body to this URL when a subscribed event happens.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="hook-url" className="mb-1.5 block text-xs font-medium">
                Endpoint URL
              </label>
              <Input
                id="hook-url"
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                placeholder="https://example.com/hooks/eagles"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Must be reachable from the internet — private and local addresses are
                refused.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">Events</p>
              <Chips
                options={WEBHOOK_EVENTS}
                selected={hookEvents}
                onChange={setHookEvents}
                describe={EVENT_DESCRIPTION}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreatingWebhook(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !hookUrl.trim() || hookEvents.length === 0}
              onClick={async () => {
                const result = await mutate(
                  () =>
                    apiRequest<WebhookDto>("/api/developer/webhooks", {
                      method: "POST",
                      body: { url: hookUrl.trim(), events: hookEvents },
                    }),
                  "Webhook created.",
                );
                if (result?.secret) {
                  setCreatingWebhook(false);
                  setHookUrl("");
                  setRevealed({
                    title: "Your signing secret",
                    description:
                      "Verify every delivery with it: HMAC-SHA256 over `<X-Eagles-Timestamp>.<raw body>`, compared against `X-Eagles-Signature`.",
                    secret: result.secret,
                  });
                }
              }}
            >
              Create webhook
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {revealed && (
        <SecretOnce
          title={revealed.title}
          description={revealed.description}
          secret={revealed.secret}
          onClose={() => setRevealed(null)}
        />
      )}

      {/* ── Delivery log ── */}
      {deliveries && (
        <DeliveriesDialog
          deliveries={deliveries}
          onClose={() => setDeliveries(null)}
        />
      )}
    </div>
  );
}
