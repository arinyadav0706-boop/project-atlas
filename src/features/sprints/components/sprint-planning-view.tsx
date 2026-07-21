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
  DeleteSprintButton,
  EditSprintButton,
  StartSprintButton,
} from "./sprint-controls";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
import type {
  SprintPanelDto,
  SprintWithProgressDto,
} from "@/features/sprints/types/sprint.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

const BACKLOG_LIST = "backlog";
const SPRINT_PREFIX = "sprint:";
// A list id is either the backlog or a specific sprint's droppable.
type ListId = typeof BACKLOG_LIST | `sprint:${string}`;

function sprintListId(sprintId: string): ListId {
  return `${SPRINT_PREFIX}${sprintId}`;
}
// The sprint id a list id refers to, or null for the backlog.
function sprintIdOf(listId: ListId): string | null {
  return listId === BACKLOG_LIST ? null : listId.slice(SPRINT_PREFIX.length);
}

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

// The Backlog page's planning view (ADR-0015): every non-completed sprint as its
// own droppable section, stacked over the backlog, all in one DndContext so
// issues drag between any sprint and the backlog. A drag within the backlog uses
// PATCH /rank (scope=backlog); any drag touching a sprint uses
// PATCH /issues/{id}/sprint (set/clear sprintId + rank). VIEWER is read-only.
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
  const canWrite = initialSprint.canWrite && initialBacklog.canWrite;
  const canManage = initialSprint.canManage;
  const completedSprints = initialSprint.completedSprints;

  // Per-sprint item lists keyed by sprint id, plus the backlog list.
  const initialMap: Record<string, IssueListItemDto[]> = {};
  for (const s of initialSprint.sprints) initialMap[s.sprint.id] = s.items;

  const [sprintItems, setSprintItems] =
    useState<Record<string, IssueListItemDto[]>>(initialMap);
  const [backlogItems, setBacklogItems] = useState<IssueListItemDto[]>(initialBacklog.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialBacklog.nextCursor);
  const [activeItem, setActiveItem] = useState<IssueListItemDto | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Re-sync from fresh server props after a lifecycle refresh (create/start/
  // complete/delete/edit) — see ADR-0014 follow-up. Guarded by a signature so a
  // plain re-render (or an optimistic drag, which doesn't refresh) never wipes
  // local state.
  const propSig = JSON.stringify({
    s: initialSprint.sprints.map((x) => [x.sprint.id, x.sprint.status, x.items.map((i) => i.id)]),
    c: initialSprint.completedSprints.map((x) => x.id),
    bi: initialBacklog.items.map((i) => i.id),
    nc: initialBacklog.nextCursor,
  });
  const [syncedSig, setSyncedSig] = useState(propSig);
  if (propSig !== syncedSig) {
    setSyncedSig(propSig);
    const m: Record<string, IssueListItemDto[]> = {};
    for (const s of initialSprint.sprints) m[s.sprint.id] = s.items;
    setSprintItems(m);
    setBacklogItems(initialBacklog.items);
    setNextCursor(initialBacklog.nextCursor);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const readList = useCallback(
    (listId: ListId): IssueListItemDto[] =>
      listId === BACKLOG_LIST ? backlogItems : sprintItems[sprintIdOf(listId)!] ?? [],
    [backlogItems, sprintItems],
  );

  const listOf = useCallback(
    (cardId: string): ListId | null => {
      if (backlogItems.some((i) => i.id === cardId)) return BACKLOG_LIST;
      for (const sid of Object.keys(sprintItems)) {
        if (sprintItems[sid]!.some((i) => i.id === cardId)) return sprintListId(sid);
      }
      return null;
    },
    [backlogItems, sprintItems],
  );

  const isListId = useCallback(
    (id: string): id is ListId =>
      id === BACKLOG_LIST || (id.startsWith(SPRINT_PREFIX) && sprintIdOf(id as ListId) !== null),
    [],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const from = listOf(id);
      setActiveItem(from ? readList(from).find((i) => i.id === id) ?? null : null);
    },
    [listOf, readList],
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
      const to: ListId | null = isListId(overId) ? overId : listOf(overId);
      if (!to) return;

      const moved = readList(from).find((i) => i.id === activeId);
      if (!moved) return;

      const backlogSnapshot = backlogItems;
      const sprintSnapshot = sprintItems;

      // Build the optimistic layout across the (possibly two) affected lists.
      const srcItems = readList(from).filter((i) => i.id !== activeId);
      const destBase = from === to ? srcItems : [...readList(to)];
      const insertAt = isListId(overId)
        ? destBase.length
        : (() => {
            const idx = destBase.findIndex((i) => i.id === overId);
            return idx >= 0 ? idx : destBase.length;
          })();
      destBase.splice(insertAt, 0, moved);

      const writeLists = (
        setB: (v: IssueListItemDto[]) => void,
        setS: (updater: (m: Record<string, IssueListItemDto[]>) => Record<string, IssueListItemDto[]>) => void,
      ) => {
        // Compute the next state for both lists in one pass.
        const nextFor = (listId: ListId) => (listId === to ? destBase : listId === from ? srcItems : null);
        if (from === BACKLOG_LIST || to === BACKLOG_LIST) {
          const b = nextFor(BACKLOG_LIST);
          if (b) setB(b);
        }
        setS((m) => {
          const copy = { ...m };
          for (const sid of Object.keys(copy)) {
            const lid = sprintListId(sid);
            const n = nextFor(lid);
            if (n) copy[sid] = n;
          }
          return copy;
        });
      };
      writeLists(setBacklogItems, setSprintItems);

      const beforeId = destBase[insertAt - 1]?.id ?? null;
      const afterId = destBase[insertAt + 1]?.id ?? null;
      const rollback = () => {
        setBacklogItems(backlogSnapshot);
        setSprintItems(sprintSnapshot);
      };

      try {
        const touchesSprint = from !== BACKLOG_LIST || to !== BACKLOG_LIST;
        const updated = touchesSprint
          ? await apiRequest<{ version: number }>(`/api/issues/${activeId}/sprint`, {
              method: "PATCH",
              body: {
                sprintId: sprintIdOf(to),
                beforeId,
                afterId,
                expectedVersion: moved.version,
              },
            })
          : await apiRequest<{ version: number }>(`/api/issues/${activeId}/rank`, {
              method: "PATCH",
              body: { scope: "backlog", beforeId, afterId, expectedVersion: moved.version },
            });

        // Refresh the moved card's version in whichever list it now lives in.
        const bump = (list: IssueListItemDto[]) =>
          list.map((i) => (i.id === activeId ? { ...i, version: updated.version } : i));
        if (to === BACKLOG_LIST) setBacklogItems(bump);
        else setSprintItems((m) => ({ ...m, [sprintIdOf(to)!]: bump(m[sprintIdOf(to)!] ?? []) }));
      } catch (error) {
        rollback();
        toast.error(error instanceof Error ? error.message : "Couldn't move that issue.");
      }
    },
    [backlogItems, sprintItems, listOf, readList, isListId],
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Sprint sections (ACTIVE first, then PLANNED) */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Sprints</h2>
        {canManage && <CreateSprintButton projectId={projectId} onChanged={onChanged} />}
      </div>

      {initialSprint.sprints.length === 0 ? (
        <p className="mb-6 rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-8 text-center text-sm text-muted-foreground">
          {canManage
            ? "No sprints yet. Create one, then drag issues from the backlog to plan it."
            : "No sprints are planned yet."}
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-4">
          {initialSprint.sprints.map(({ sprint }) => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              projectId={projectId}
              items={sprintItems[sprint.id] ?? []}
              canWrite={canWrite}
              canManage={canManage}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

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

      {/* Completed sprints (history) */}
      {completedSprints.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Completed sprints</h2>
          <div className="flex flex-col gap-2">
            {completedSprints.map((s) => (
              <CompletedSprintCard
                key={s.id}
                sprint={s}
                canManage={canManage}
                onChanged={onChanged}
              />
            ))}
          </div>
        </section>
      )}

      <DragOverlay>
        {activeItem && (
          <BacklogItem projectId={projectId} item={activeItem} canWrite={canWrite} overlay />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SprintSection({
  sprint,
  projectId,
  items,
  canWrite,
  canManage,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  projectId: string;
  items: IssueListItemDto[];
  canWrite: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const done = items.filter((i) => i.status === "DONE").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue =
    sprint.status === "ACTIVE" && sprint.endDate ? new Date(sprint.endDate) < new Date() : false;

  return (
    <section className="rounded-xl border border-border/60 bg-surface/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{sprint.name}</h3>
          <Badge variant={sprint.status === "ACTIVE" ? "accent" : "outline"}>
            {sprint.status === "ACTIVE" ? "Active" : "Planned"}
          </Badge>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <EditSprintButton sprint={sprint} onChanged={onChanged} />
            <DeleteSprintButton sprint={sprint} onChanged={onChanged} />
            {sprint.status === "PLANNED" && (
              <StartSprintButton sprint={sprint} onChanged={onChanged} />
            )}
            {sprint.status === "ACTIVE" && (
              <CompleteSprintButton sprint={sprint} onChanged={onChanged} />
            )}
          </div>
        )}
      </div>

      {sprint.goal && <p className="mb-2 text-sm text-muted-foreground">{sprint.goal}</p>}
      {(sprint.startDate || sprint.endDate) && (
        <p className="mb-2 text-xs text-muted-foreground">
          {formatDateRange(sprint.startDate, sprint.endDate)}
          {overdue && <span className="ml-2 font-medium text-destructive">Overdue</span>}
        </p>
      )}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done}/{total} done
        </span>
      </div>

      <DroppableList
        listId={sprintListId(sprint.id)}
        projectId={projectId}
        items={items}
        canWrite={canWrite}
        emptyText="Drag issues here to plan this sprint."
      />
    </section>
  );
}

function formatDateRange(startIso: string | null, endIso: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (startIso && endIso) return `${fmt(startIso)} – ${fmt(endIso)}`;
  if (startIso) return `Starts ${fmt(startIso)}`;
  if (endIso) return `Ends ${fmt(endIso)}`;
  return "";
}

// A completed sprint in the history section: name, dates, final progress, and a
// delete control (LEAD). Read-only otherwise — its issue set is the record.
function CompletedSprintCard({
  sprint,
  canManage,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { doneIssues, totalIssues } = sprint.progress;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/30 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{sprint.name}</span>
          <Badge variant="outline">Completed</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDateRange(sprint.startDate, sprint.endDate)}
          {sprint.startDate || sprint.endDate ? " · " : ""}
          {doneIssues}/{totalIssues} done
        </span>
      </div>
      {canManage && <DeleteSprintButton sprint={sprint} onChanged={onChanged} />}
    </div>
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
