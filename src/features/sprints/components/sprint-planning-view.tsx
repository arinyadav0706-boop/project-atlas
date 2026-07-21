"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { BacklogItem } from "@/features/backlog/components/backlog-item";
import {
  CompleteSprintButton,
  CreateSprintButton,
  StartSprintButton,
} from "./sprint-controls";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
import type { SprintPanelDto } from "@/features/sprints/types/sprint.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

const SPRINT_LIST = "list:sprint";
const BACKLOG_LIST = "list:backlog";
type ListId = typeof SPRINT_LIST | typeof BACKLOG_LIST;

// Drop target is whatever the CURSOR is over (pointer-first), not the dragged
// card's nearest corner — a wide card near a list boundary otherwise mis-targets
// (same rationale as the Board). Rect fallback for keyboard drags.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

// The Backlog page's planning view (ADR-0014): the current sprint section over
// the backlog list, in one DndContext so issues drag between them. A drag within
// the backlog uses PATCH /rank (scope=backlog); any drag touching the sprint
// uses PATCH /issues/{id}/sprint (set/clear sprintId + rank). VIEWER is read-only.
export function SprintPlanningView({
  projectId,
  initialSprint,
  initialBacklog,
}: {
  projectId: string;
  initialSprint: SprintPanelDto;
  initialBacklog: BacklogDto;
}) {
  const router = useRouter();
  const sprint = initialSprint.sprint;
  const canWrite = initialSprint.canWrite && initialBacklog.canWrite;

  const [sprintItems, setSprintItems] = useState<IssueListItemDto[]>(initialSprint.items);
  const [backlogItems, setBacklogItems] = useState<IssueListItemDto[]>(initialBacklog.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialBacklog.nextCursor);
  const [activeItem, setActiveItem] = useState<IssueListItemDto | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const listOf = useCallback(
    (id: string): ListId | null => {
      if (sprintItems.some((i) => i.id === id)) return SPRINT_LIST;
      if (backlogItems.some((i) => i.id === id)) return BACKLOG_LIST;
      return null;
    },
    [sprintItems, backlogItems],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setActiveItem(
        sprintItems.find((i) => i.id === id) ?? backlogItems.find((i) => i.id === id) ?? null,
      );
    },
    [sprintItems, backlogItems],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      const from = listOf(activeId);
      if (!from) return;
      const to: ListId | null =
        overId === SPRINT_LIST || overId === BACKLOG_LIST ? (overId as ListId) : listOf(overId);
      // Can't move into a sprint that doesn't exist.
      if (!to || (to === SPRINT_LIST && !sprint)) return;

      const sprintSnapshot = sprintItems;
      const backlogSnapshot = backlogItems;
      const moved = (from === SPRINT_LIST ? sprintItems : backlogItems).find(
        (i) => i.id === activeId,
      );
      if (!moved) return;

      const source = from === SPRINT_LIST ? [...sprintItems] : [...backlogItems];
      const dest =
        from === to ? source : to === SPRINT_LIST ? [...sprintItems] : [...backlogItems];
      const srcAfterRemove = source.filter((i) => i.id !== activeId);
      const destList = from === to ? srcAfterRemove : dest;

      const insertAt =
        overId === SPRINT_LIST || overId === BACKLOG_LIST
          ? destList.length
          : (() => {
              const idx = destList.findIndex((i) => i.id === overId);
              return idx >= 0 ? idx : destList.length;
            })();
      destList.splice(insertAt, 0, moved);

      // Commit the optimistic layout.
      if (from === to) {
        if (to === SPRINT_LIST) setSprintItems(destList);
        else setBacklogItems(destList);
      } else {
        if (from === SPRINT_LIST) setSprintItems(srcAfterRemove);
        else setBacklogItems(srcAfterRemove);
        if (to === SPRINT_LIST) setSprintItems(destList);
        else setBacklogItems(destList);
      }

      const beforeId = destList[insertAt - 1]?.id ?? null;
      const afterId = destList[insertAt + 1]?.id ?? null;

      const rollback = () => {
        setSprintItems(sprintSnapshot);
        setBacklogItems(backlogSnapshot);
      };

      try {
        // Within the backlog → pure reorder (ADR-0013). Anything touching the
        // sprint → membership move (ADR-0014).
        const touchesSprint = from === SPRINT_LIST || to === SPRINT_LIST;
        const updated = touchesSprint
          ? await apiRequest<{ version: number }>(`/api/issues/${activeId}/sprint`, {
              method: "PATCH",
              body: {
                sprintId: to === SPRINT_LIST ? sprint!.id : null,
                beforeId,
                afterId,
                expectedVersion: moved.version,
              },
            })
          : await apiRequest<{ version: number }>(`/api/issues/${activeId}/rank`, {
              method: "PATCH",
              body: { scope: "backlog", beforeId, afterId, expectedVersion: moved.version },
            });

        // Refresh the moved card's version so a subsequent drag isn't stale.
        const bump = (list: IssueListItemDto[]) =>
          list.map((i) => (i.id === activeId ? { ...i, version: updated.version } : i));
        if (to === SPRINT_LIST) setSprintItems(bump);
        else setBacklogItems(bump);
      } catch (error) {
        rollback();
        toast.error(error instanceof Error ? error.message : "Couldn't move that issue.");
      }
    },
    [sprint, sprintItems, backlogItems, listOf],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<BacklogDto>(
        `/api/projects/${projectId}/backlog?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setBacklogItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, nextCursor, loadingMore]);

  const onChanged = useCallback(() => router.refresh(), [router]);

  // Progress bar derives from the live sprint list so it updates as you drag.
  const done = sprintItems.filter((i) => i.status === "DONE").length;
  const total = sprintItems.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Panel-level (LEAD) — works even when there is no sprint yet, so the
  // "Create sprint" control appears for a lead on an empty project.
  const canManage = initialSprint.canManage;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Sprint section */}
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {sprint ? sprint.name : "Sprint"}
            </h2>
            {sprint && (
              <Badge variant={sprint.status === "ACTIVE" ? "accent" : "outline"}>
                {sprint.status === "ACTIVE" ? "Active" : "Planned"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!sprint && canManage && (
              <CreateSprintButton projectId={projectId} onChanged={onChanged} />
            )}
            {sprint && canManage && sprint.status === "PLANNED" && (
              <StartSprintButton sprint={sprint} onChanged={onChanged} />
            )}
            {sprint && canManage && sprint.status === "ACTIVE" && (
              <CompleteSprintButton sprint={sprint} onChanged={onChanged} />
            )}
          </div>
        </div>

        {sprint ? (
          <>
            {sprint.goal && (
              <p className="mb-2 text-sm text-muted-foreground">{sprint.goal}</p>
            )}
            <div className="mb-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {done}/{total} done
              </span>
            </div>
            <DroppableList
              listId={SPRINT_LIST}
              projectId={projectId}
              items={sprintItems}
              canWrite={canWrite}
              emptyText="Drag issues here to plan this sprint."
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-8 text-center text-sm text-muted-foreground">
            {canManage
              ? "No sprint yet. Create one, then drag issues from the backlog to plan it."
              : "No sprint is planned yet."}
          </p>
        )}
      </section>

      {/* Backlog section */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Backlog</h2>
        <DroppableList
          listId={BACKLOG_LIST}
          projectId={projectId}
          items={backlogItems}
          canWrite={canWrite}
          emptyText="The backlog is empty — new issues land here until they're scheduled."
        />
        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>

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
  );
}

function DroppableList({
  listId,
  projectId,
  items,
  canWrite,
  emptyText,
}: {
  listId: ListId;
  projectId: string;
  items: IssueListItemDto[];
  canWrite: boolean;
  emptyText: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: listId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-16 flex-col gap-2 rounded-xl border border-border/60 bg-surface/30 p-2 transition-colors",
        isOver && "border-accent/50 bg-accent/5",
      )}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <BacklogItem key={item.id} projectId={projectId} item={item} canWrite={canWrite} />
        ))}
      </SortableContext>
      {items.length === 0 && (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
