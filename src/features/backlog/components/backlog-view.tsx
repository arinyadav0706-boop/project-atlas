"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { BacklogItem } from "./backlog-item";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// The Backlog is a single ordered list of a project's unscheduled issues
// (ADR-0013). A drag optimistically reorders and persists via
// PATCH /issues/{id}/rank with scope=backlog; on a server rejection
// (illegal/lost-race, OCC) the previous order is restored (06_backlog.md UI).
// VIEWER (canWrite=false) sees a static, read-only list.
export function BacklogView({
  projectId,
  initialBacklog,
}: {
  projectId: string;
  initialBacklog: BacklogDto;
}) {
  const [items, setItems] = useState<IssueListItemDto[]>(initialBacklog.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialBacklog.nextCursor,
  );
  const [activeItem, setActiveItem] = useState<IssueListItemDto | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const canWrite = initialBacklog.canWrite;

  const sensors = useSensors(
    // A small movement threshold lets a plain click open the issue instead of
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveItem(items.find((i) => i.id === id) ?? null);
    },
    [items],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      const from = items.findIndex((i) => i.id === activeId);
      const to = items.findIndex((i) => i.id === overId);
      if (from < 0 || to < 0) return;

      const snapshot = items;
      const moved = items[from];
      if (!moved) return;

      // Optimistic reorder: move the row to its new index.
      const next = [...items];
      next.splice(from, 1);
      next.splice(to, 0, moved);
      setItems(next);

      // Neighbours the server ranks between (ascending rank = top→bottom).
      const insertAt = next.findIndex((i) => i.id === activeId);
      const beforeId = next[insertAt - 1]?.id ?? null;
      const afterId = next[insertAt + 1]?.id ?? null;

      try {
        // Optimistic concurrency (ADR-0011): send the version we dragged from;
        // the server rejects the move if the row changed since.
        const updated = await apiRequest<{ version: number }>(
          `/api/issues/${activeId}/rank`,
          {
            method: "PATCH",
            body: {
              scope: "backlog",
              beforeId,
              afterId,
              expectedVersion: moved.version,
            },
          },
        );
        // Refresh the moved row's version so a subsequent drag isn't stale.
        setItems((prev) =>
          prev.map((i) =>
            i.id === activeId ? { ...i, version: updated.version } : i,
          ),
        );
      } catch (error) {
        // Server rejected (stale neighbour / lost race): restore exactly.
        setItems(snapshot);
        toast.error(error instanceof Error ? error.message : "Couldn't move that item.");
      }
    },
    [items],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<BacklogDto>(
        `/api/projects/${projectId}/backlog?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, nextCursor, loadingMore]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          The backlog is empty — new issues land here until they&apos;re scheduled.
        </p>
      </div>
    );
  }

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-2">
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((item) => (
              <BacklogItem
                key={item.id}
                projectId={projectId}
                item={item}
                canWrite={canWrite}
              />
            ))}
          </SortableContext>
        </div>
        <DragOverlay>
          {activeItem && (
            <BacklogItem
              projectId={projectId}
              item={activeItem}
              canWrite={canWrite}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
