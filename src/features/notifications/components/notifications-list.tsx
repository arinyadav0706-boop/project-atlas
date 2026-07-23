"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import type {
  NotificationDto,
  NotificationListDto,
} from "@/features/notifications/types/notification.types";

// The full notification history (10_notifications.md). Same read/navigate
// behavior as the bell, plus keyset "load more".
export function NotificationsList({ initial }: { initial: NotificationListDto }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDto[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await apiRequest<NotificationListDto>(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await apiRequest("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
  }

  async function open(n: NotificationDto) {
    if (!n.isRead) {
      await apiRequest(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
    }
    if (n.link) router.push(n.link);
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {items.some((i) => !i.isRead) && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                n.isRead ? "bg-transparent" : "bg-accent"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">{n.message}</span>
              <span className="block text-xs text-muted-foreground">
                {new Date(n.createdAt).toLocaleString()}
              </span>
            </span>
          </button>
        ))}
      </div>
      {nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
