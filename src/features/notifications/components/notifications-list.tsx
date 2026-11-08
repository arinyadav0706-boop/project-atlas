"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox, ExternalLink } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import type {
  NotificationDto,
  NotificationListDto,
} from "@/features/notifications/types/notification.types";

export function NotificationsList({ initial }: { initial: NotificationListDto }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [pageSize, setPageSize] = useState<number>(20);

  // Pagination cursor stack
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const [items, setItems] = useState<NotificationDto[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [unreadCount, setUnreadCount] = useState<number>(initial.unreadCount);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (c: string | undefined, take: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (c) params.set("cursor", c);
      params.set("take", String(take));
      const page = await apiRequest<NotificationListDto>(
        `/api/notifications?${params.toString()}`
      );
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNextPage = useCallback(() => {
    if (!nextCursor) return;
    const nextIdx = pageIndex + 1;
    setCursorStack((prev) => {
      const copy = prev.slice(0, nextIdx);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex(nextIdx);
    void fetchPage(nextCursor, pageSize);
  }, [nextCursor, pageIndex, pageSize, fetchPage]);

  const handlePrevPage = useCallback(() => {
    if (pageIndex <= 0) return;
    const prevIdx = pageIndex - 1;
    const prevCursor = cursorStack[prevIdx];
    setPageIndex(prevIdx);
    void fetchPage(prevCursor, pageSize);
  }, [pageIndex, cursorStack, pageSize, fetchPage]);

  async function markAllRead() {
    await apiRequest("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    setUnreadCount(0);
  }

  async function open(n: NotificationDto) {
    if (!n.isRead) {
      await apiRequest(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.link) router.push(n.link);
  }

  const displayedItems = filter === "UNREAD" ? items.filter((i) => !i.isRead) : items;
  const rangeStart = pageIndex * pageSize + 1;
  const rangeEnd = rangeStart + displayedItems.length - 1;
  const rangeLabel = displayedItems.length > 0 ? `${rangeStart}–${rangeEnd}` : "0";

  return (
    <div className="space-y-4">
      {/* Control Bar: Filter Tabs + Mark all read */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-2.5 shadow-2xs">
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              filter === "ALL"
                ? "bg-surface font-semibold text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Notifications
          </button>
          <button
            type="button"
            onClick={() => setFilter("UNREAD")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
              filter === "UNREAD"
                ? "bg-surface font-semibold text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5 text-primary" />
            <span>Mark all read</span>
          </Button>
        )}
      </div>

      {/* Notifications List Container */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        {displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-3">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">All caught up</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "UNREAD"
                ? "No unread notifications to review."
                : "No notifications have been received yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {displayedItems.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={`group flex w-full items-start gap-3.5 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:bg-muted/40 ${
                  !n.isRead ? "bg-primary/[0.03]" : ""
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-all ${
                    !n.isRead ? "bg-primary shadow-xs ring-4 ring-primary/10" : "bg-transparent"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                      {n.message}
                    </span>
                    <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider">
                      {n.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {new Date(n.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {n.link && (
                      <span className="inline-flex items-center gap-0.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        View <ExternalLink className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Keyset DataPagination */}
        <DataPagination
          mode="cursor"
          hasPrev={pageIndex > 0}
          hasNext={Boolean(nextCursor)}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          rangeLabel={rangeLabel}
          pageSize={pageSize}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCursorStack([undefined]);
            setPageIndex(0);
            void fetchPage(undefined, s);
          }}
          pageSizeOptions={[10, 20, 50]}
        />
      </div>
    </div>
  );
}
