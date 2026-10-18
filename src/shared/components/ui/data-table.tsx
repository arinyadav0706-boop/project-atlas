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

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  density?: "compact" | "comfortable";
  onRowClick?: (row: TData) => void;
  className?: string;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  density = "compact",
  onRowClick,
  className,
  emptyMessage = "No results found.",
  isLoading = false,
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

  const rowHeightClass = density === "compact" ? "h-8 py-1 px-3 text-xs" : "h-10 py-2 px-4 text-sm";
  const headerHeightClass = density === "compact" ? "h-8 px-3 text-[11px]" : "h-9 px-4 text-xs";

  return (
    <div className={cn("w-full overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-left text-foreground">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-sunken">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b transition-colors">
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "font-medium uppercase tracking-wider text-muted-foreground select-none",
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
            ))}
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface">
            {isLoading ? (\n              <tr>
                <td colSpan={columns.length} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading data...
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={cn(
                    "transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("align-middle font-normal", rowHeightClass)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
