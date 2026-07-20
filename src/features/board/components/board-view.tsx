"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { ISSUE_STATUSES } from "@/features/issues/services/issue-workflow";
import { BoardColumn, COLUMN_DROP_PREFIX } from "./board-column";
import { BoardCard } from "./board-card";
import { BoardFilterBar } from "./board-filter-bar";
import type { BoardDto, BoardFilter } from "@/features/board/types/board.types";
import type {
  IssueListItemDto,
  IssueStatusCounts,
  IssueStatusDto,
} from "@/features/issues/types/issue.types";

type Columns = Record<IssueStatusDto, IssueListItemDto[]>;

function toColumns(board: BoardDto): Columns {
  const cols = emptyColumns();
  for (const column of board.columns) cols[column.status] = column.items;
  return cols;
}

function emptyColumns(): Columns {
  return { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
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
}: {
  projectId: string;
  initialBoard: BoardDto;
  members: { userId: string; name: string }[];
}) {
  const [columns, setColumns] = useState<Columns>(() => toColumns(initialBoard));
  const [counts, setCounts] = useState<IssueStatusCounts>(initialBoard.counts);
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
        setCounts(board.counts);
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

  const containerOfCard = useCallback(
    (cardId: string): IssueStatusDto | null =>
      ISSUE_STATUSES.find((s) => columns[s].some((i) => i.id === cardId)) ?? null,
    [columns],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const from = containerOfCard(id);
      setActiveCard(from ? columns[from].find((i) => i.id === id) ?? null : null);
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
        ? (overId.slice(COLUMN_DROP_PREFIX.length) as IssueStatusDto)
        : containerOfCard(overId);
      if (!to) return;
      if (activeId === overId) return; // dropped on itself — no change

      const columnsSnapshot = columns;
      const countsSnapshot = counts;
      const moved = columns[from].find((i) => i.id === activeId);
      if (!moved) return;

      // Build the optimistic layout: remove from source, insert into dest.
      const sourceAfter = columns[from].filter((i) => i.id !== activeId);
      const dest = from === to ? sourceAfter : [...columns[to]];
      const insertAt = overId.startsWith(COLUMN_DROP_PREFIX)
        ? dest.length
        : (() => {
            const idx = dest.findIndex((i) => i.id === overId);
            return idx >= 0 ? idx : dest.length;
          })();
      dest.splice(insertAt, 0, { ...moved, status: to });

      const next: Columns = { ...columns, [from]: sourceAfter, [to]: dest };
      // Neighbours the server ranks between (ascending rank order = top→bottom).
      const beforeId = dest[insertAt - 1]?.id ?? null;
      const afterId = dest[insertAt + 1]?.id ?? null;

      setColumns(next);
      if (from !== to) {
        setCounts((c) => ({ ...c, [from]: c[from] - 1, [to]: c[to] + 1 }));
      }

      try {
        await apiRequest(`/api/issues/${activeId}/rank`, {
          method: "PATCH",
          body: { ...(from !== to ? { status: to } : {}), beforeId, afterId },
        });
      } catch (error) {
        // Server rejected (illegal transition / stale neighbour / lost race):
        // restore the previous layout and counts exactly.
        setColumns(columnsSnapshot);
        setCounts(countsSnapshot);
        toast.error(error instanceof Error ? error.message : "Couldn't move that card.");
      }
    },
    [columns, counts, containerOfCard],
  );

  const columnList = useMemo(() => ISSUE_STATUSES, []);

  return (
    <div>
      <BoardFilterBar members={members} filter={filter} onChange={setFilter} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {columnList.map((status) => (
            <BoardColumn
              key={status}
              projectId={projectId}
              status={status}
              items={columns[status]}
              count={counts[status]}
              canWrite={canWrite}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <BoardCard
              projectId={projectId}
              item={activeCard}
              canWrite={canWrite}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
