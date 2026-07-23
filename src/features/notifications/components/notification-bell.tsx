"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import type { NotificationListDto } from "@/features/notifications/types/notification.types";

// Top-bar bell (10_notifications.md, ADR-0019). Pull-based: it polls the unread
// count and loads the recent list when opened. Clicking a notification marks it
// read and navigates to its target.
const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState<NotificationListDto | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await apiRequest<{ count: number }>(
        "/api/notifications/unread-count",
      );
      setUnread(count);
    } catch {
      // A transient count failure is non-critical; try again next poll.
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  async function loadList() {
    setLoading(true);
    try {
      const data = await apiRequest<NotificationListDto>("/api/notifications");
      setPage(data);
      setUnread(data.unreadCount);
    } catch {
      // Leave the previous list; the empty/error state is handled below.
    } finally {
      setLoading(false);
    }
  }

  async function open(isOpen: boolean) {
    if (isOpen) await loadList();
  }

  async function onItemClick(id: string, link: string | null) {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Navigation is the important part; the read flag will reconcile on reload.
    }
    setUnread((n) => Math.max(0, n - 1));
    setPage((p) =>
      p ? { ...p, items: p.items.map((i) => (i.id === id ? { ...i, isRead: true } : i)) } : p,
    );
    if (link) router.push(link);
  }

  async function markAllRead() {
    try {
      await apiRequest("/api/notifications/read-all", { method: "POST" });
      setUnread(0);
      setPage((p) =>
        p ? { ...p, items: p.items.map((i) => ({ ...i, isRead: true })) } : p,
      );
    } catch {
      // no-op; the badge reconciles on the next poll.
    }
  }

  return (
    <DropdownMenu onOpenChange={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className="relative rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {(page?.items.some((i) => !i.isRead) ?? false) && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && !page && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {page && page.items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          )}
          {page?.items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onItemClick(n.id, n.link)}
              className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.isRead ? "bg-transparent" : "bg-accent"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{n.message}</span>
                <span className="block text-xs text-muted-foreground">
                  {relativeTime(n.createdAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            onClick={() => router.push("/notifications")}
          >
            View all
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
