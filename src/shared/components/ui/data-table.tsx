"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState,
} from "@tanstack/react-table";
import { cn } from "@/shared/lib/utils";
import { DataPagination, type DataPaginationProps } from "@/shared/components/ui/data-pagination";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  density?: "compact" | "comfortable";
  onRowClick?: (row: TData) => void;
  className?: string;
  tableClassName?: string;
  emptyMessage?: React.ReactNode;
  isLoading?: boolean;
  pagination?: DataPaginationProps;
  /** Sticky header height or container bounds (e.g. max-h-[calc(100vh-280px)]) */
  maxHeight?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  density = "compact",
  onRowClick,
  className,
  tableClassName,
  emptyMessage = "No results found.",
  isLoading = false,
  pagination,
  maxHeight,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  const rowHeightClass = density === "compact" ? "h-9 py-1 px-3 text-xs" : "h-11 py-2 px-4 text-sm";
  const headerHeightClass = density === "compact" ? "h-8 px-3 text-[11px]" : "h-10 px-4 text-xs";

  return (
    <div className={cn("flex flex-col w-full overflow-hidden rounded-xl border border-border bg-surface shadow-2xs", className)}>
      <div className={cn("relative w-full overflow-auto", maxHeight && maxHeight)}>
        <table className={cn("w-full caption-bottom text-left text-foreground", tableClassName)}>
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 backdrop-blur-xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border/80 transition-colors">
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "font-semibold uppercase tracking-wider text-muted-foreground select-none",
                        headerHeightClass
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}\n          </thead>
          <tbody className="divide-y divide-border/50 bg-surface">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Loading records…</span>
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={cn(
                    "group transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted/60",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("align-middle font-normal text-foreground", rowHeightClass)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1.5 py-4">
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && <DataPagination {...pagination} />}
    </div>
  );
}
