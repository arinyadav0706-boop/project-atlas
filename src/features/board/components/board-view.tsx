"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Bleed, Toolbar, Workspace } from "@/shared/components/layout/app-frame";
import { BoardColumn, COLUMN_DROP_PREFIX } from "./board-column";
import { BoardCard } from "./board-card";
import { BoardFilterBar } from "./board-filter-bar";
import type { BoardDto, BoardFilter } from "@/features/board/types/board.types";
import type {
  IssueListItemDto,
  IssueStatusCounts,
  } from "@/features/issues/types/issue.types";

// Keyed by STATUS ID, not by category (30_workflow BR-5). A project can have
// three columns that are all IN_PROGRESS, and a category-keyed map would merge
// them into one.
type Columns = Record<string, IssueListItemDto[]>;
/** Keyed by status id, like everything else on this page. */
type Cursors = Record<string, string | null>;

// The drop target is whatever the CURSOR is over, not the dragged card's
// nearest corner (closestCorners) — a wide card near a column boundary
// mis-targets the adjacent column, so dropping onto an empty column could land
// in the next one. Pointer-first, with a rect fallback for keyboard drags.
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

function toColumns(board: BoardDto): Columns {
  const cols: Columns = {};
  for (const column of board.columns) cols[column.status.id] = column.items;
  return cols;
}

function toCursors(board: BoardDto): Cursors {
  return Object.fromEntries(board.columns.map((c) => [c.status.id, c.nextCursor]));
}

function filterToQuery(filter: BoardFilter): string {
  const params = new URLSearchParams();
  if (filter.assigneeId) params.set("assigneeId", filter.assigneeId);
  if (filter.type) params.set("type", filter.type);
  if (filter.priority) params.set("priority", filter.priority);
  if (filter.sprintId) params.set("sprintId", filter.sprintId);
  if (filter.epicId) params.set("epicId", filter.epicId);
  if (filter.search) params.set("search", filter.search);
  for (const id of filter.labelIds ?? []) params.append("labelIds", id);
  for (const id of filter.componentIds ?? []) params.append("componentIds", id);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Filter-agnostic board (ADR-0008): one component renders any BoardFilter. A
// drag optimistically re-lays the columns and persists via PATCH /rank; on a
// server rejection the previous layout is restored (05_board.md UI). VIEWER
// (canWrite=false) sees a static, read-only board.
export function BoardView({
  projectId,
  initialBoard,
  members,
  labels,
  components,
  epics,
  sprints,
}: {
  projectId: string;
  initialBoard: BoardDto;
  members: { userId: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  components: { id: string; name: string }[];
  epics: { id: string; key: string; title: string }[];
  sprints: { id: string; name: string; status: string }[];
}) {
  const [columns, setColumns] = useState<Columns>(() => toColumns(initialBoard));
  // The column definitions themselves are data now, so they move with the board.
  const [statuses, setStatuses] = useState(() => initialBoard.columns.map((c) => c.status));
  const [columnCounts, setColumnCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialBoard.columns.map((c) => [c.status.id, c.count])),
  );
  const [counts, setCounts] = useState<IssueStatusCounts>(initialBoard.counts);
  const [cursors, setCursors] = useState<Cursors>(() => toCursors(initialBoard));
  const [loadingColumn, setLoadingColumn] = useState<string | null>(null);
  const [filter, setFilter] = useState<BoardFilter>(initialBoard.appliedFilter);
  const [activeCard, setActiveCard] = useState<IssueListItemDto | null>(null);
  const canWrite = initialBoard.canWrite;
  const firstRender = useRef(true);

  const sensors = useSensors(
    // A small movement threshold lets a plain click open the issue instead of
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Refetch when the filter changes (skip the initial server-provided board).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const board = await apiRequest<BoardDto>(
          `/api/projects/${projectId}/board${filterToQuery(filter)}`,
        );
        if (cancelled) return;
        setColumns(toColumns(board));
        setStatuses(board.columns.map((c) => c.status));
        setColumnCounts(Object.fromEntries(board.columns.map((c) => [c.status.id, c.count])));
        setCounts(board.counts);
        // A new filter is a new set of columns: the old cursors point into the
        // previous result and would append cards the filter excludes.
        setCursors(toCursors(board));
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load board.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, filter]);

  /**
   * The next page of one column (UX-5).
   *
   * Appends rather than replaces, and only one column moves — the other eleven
   * keep their own scroll position and their own paging. Re-reading the whole
   * board to grow one column would throw away both.
   */
  const loadMore = useCallback(
    async (statusId: string) => {
      const cursor = cursors[statusId];
      if (!cursor || loadingColumn) return;
      setLoadingColumn(statusId);
      try {
        const query = filterToQuery(filter);
        const sep = query ? "&" : "?";
        const page = await apiRequest<{
          items: IssueListItemDto[];
          nextCursor: string | null;
        }>(
          `/api/projects/${projectId}/board/columns/${statusId}${query}${sep}cursor=${encodeURIComponent(cursor)}`,
        );
        setColumns((prev) => {
          // Guard against a double-append if the same page arrives twice: a
          // duplicated card id would break both dnd-kit and React keys.
          const seen = new Set((prev[statusId] ?? []).map((i) => i.id));
          const added = page.items.filter((i) => !seen.has(i.id));
          return { ...prev, [statusId]: [...(prev[statusId] ?? []), ...added] };
        });
        setCursors((prev) => ({ ...prev, [statusId]: page.nextCursor }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't load more cards.");
      } finally {
        setLoadingColumn(null);
      }
    },
    [projectId, filter, cursors, loadingColumn],
  );

  const containerOfCard = useCallback(
    (cardId: string): string | null =>
      Object.keys(columns).find((id) => columns[id]!.some((i) => i.id === cardId)) ?? null,
    [columns],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const from = containerOfCard(id);
      setActiveCard(from ? columns[from]?.find((i) => i.id === id) ?? null : null);
    },
    [columns, containerOfCard],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      const from = containerOfCard(activeId);
      if (!from) return;
      const to = overId.startsWith(COLUMN_DROP_PREFIX)
        ? overId.slice(COLUMN_DROP_PREFIX.length)
        : containerOfCard(overId);
      if (!to) return;
      if (activeId === overId) return; // dropped on itself — no change

      const columnsSnapshot = columns;
      const countsSnapshot = counts;
      const columnCountsSnapshot = columnCounts;
      const moved = columns[from]?.find((i) => i.id === activeId);
      if (!moved) return;
      const destStatus = statuses.find((s) => s.id === to);
      if (!destStatus) return;

      // Build the optimistic layout: remove from source, insert into dest.
      const sourceAfter = columns[from]!.filter((i) => i.id !== activeId);
      const dest = from === to ? sourceAfter : [...(columns[to] ?? [])];
      const insertAt = overId.startsWith(COLUMN_DROP_PREFIX)
        ? dest.length
        : (() => {
            const idx = dest.findIndex((i) => i.id === overId);
            return idx >= 0 ? idx : dest.length;
          })();
      // The card carries the CATEGORY for its colouring, and the destination
      // status supplies it — the two must not drift even for the optimistic
      // frame (30_workflow BR-2).
      dest.splice(insertAt, 0, {
        ...moved,
        status: destStatus.category,
        workflowStatus: destStatus,
      });

      const next: Columns = { ...columns, [from]: sourceAfter, [to]: dest };
      // Neighbours the server ranks between (ascending rank order = top→bottom).
      const beforeId = dest[insertAt - 1]?.id ?? null;
      const afterId = dest[insertAt + 1]?.id ?? null;

      const fromStatus = statuses.find((s) => s.id === from);
      setColumns(next);
      if (from !== to) {
        setColumnCounts((c) => ({
          ...c,
          [from]: (c[from] ?? 1) - 1,
          [to]: (c[to] ?? 0) + 1,
        }));
        // The category chips only move when the CATEGORY does — dragging
        // between two in-progress columns changes neither chip.
        if (fromStatus && fromStatus.category !== destStatus.category) {
          setCounts((c) => ({
            ...c,
            [fromStatus.category]: c[fromStatus.category] - 1,
            [destStatus.category]: c[destStatus.category] + 1,
          }));
        }
      }

      try {
        // Optimistic concurrency (ADR-0011): send the version we dragged from;
        // the server rejects the move if the card changed since.
        const updated = await apiRequest<{ version: number }>(
          `/api/issues/${activeId}/rank`,
          {
            method: "PATCH",
            body: {
              ...(from !== to ? { statusId: to } : {}),
              beforeId,
              afterId,
              expectedVersion: moved.version,
            },
          },
        );
        // Refresh the moved card's version so a subsequent drag isn't stale.
        setColumns((prev) => ({
          ...prev,
          [to]: (prev[to] ?? []).map((i) =>
            i.id === activeId ? { ...i, version: updated.version } : i,
          ),
        }));
      } catch (error) {
        // Server rejected (illegal transition / stale neighbour / lost race):
        // restore the previous layout and counts exactly.
        setColumns(columnsSnapshot);
        setCounts(countsSnapshot);
        setColumnCounts(columnCountsSnapshot);
        toast.error(error instanceof Error ? error.message : "Couldn't move that card.");
      }
    },
    [columns, counts, columnCounts, statuses, containerOfCard],
  );

  return (
    <Bleed>
      <Toolbar>
        <BoardFilterBar
          members={members}
          labels={labels}
          components={components}
          epics={epics}
          sprints={sprints}
          filter={filter}
          onChange={setFilter}
        />
      </Toolbar>

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/* The board scrolls HORIZONTALLY and the columns scroll vertically —
            two axes, each owned by the thing it belongs to. Before, the whole
            document scrolled: a long To Do column pushed every other column's
            cards off screen, so you scrolled past forty cards you did not care
            about to find out whether Done had anything in it.

            Columns are data, so their number is not known at build time; a
            fixed 4-up grid squeezed twelve statuses into unreadable slivers. A
            row of fixed-width columns degrades honestly — the board gets wider,
            not denser. */}
        <Workspace className="overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-h-0 snap-x gap-3 p-3">
            {statuses.map((status) => (
              // Columns GROW to fill the board and stop growing when they get
              // wide enough to be silly. A fixed 304px left ~400px of a 1920
              // screen empty on a four-column board, which is the same dead
              // space /issues was rebuilt to remove; an unbounded `1fr` would
              // stretch two columns to 800px each and make a 5-word card title
              // look lost. Below the floor the row scrolls, which is the honest
              // answer for a team with twelve statuses.
              <div
                key={status.id}
                className="h-full min-w-[272px] max-w-[420px] flex-1 shrink-0 basis-[304px] snap-start"
              >
                <BoardColumn
                  projectId={projectId}
                  status={status}
                  items={columns[status.id] ?? []}
                  count={columnCounts[status.id] ?? 0}
                  canWrite={canWrite}
                  hasMore={cursors[status.id] != null}
                  loadingMore={loadingColumn === status.id}
                  onLoadMore={() => void loadMore(status.id)}
                />
              </div>
            ))}
          </div>
        </Workspace>

        <DragOverlay>
          {activeCard && (
            <BoardCard projectId={projectId} item={activeCard} canWrite={canWrite} overlay />
          )}
        </DragOverlay>
      </DndContext>
    </Bleed>
  );
}
