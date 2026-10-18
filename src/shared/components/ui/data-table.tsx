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
  maxHeight?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  density = "comfortable",
  onRowClick,
  className,
  tableClassName,
  emptyMessage = "No results found.",
  isLoading = false,
  pagination,
  maxHeight,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

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

  const rowHeightClass =
    density === "compact"
      ? "h-10 py-2 px-4 text-[13px]"
      : "h-12 py-3 px-5 text-sm";
  const headerHeightClass =
    density === "compact"
      ? "h-9 px-4 text-xs"
      : "h-11 px-5 text-xs";

  return (
    <div
      className={cn(
        "flex flex-col w-full overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-card",
        className
      )}
    >
      <div className={cn("relative w-full overflow-auto", maxHeight && maxHeight)}>
        <table className={cn("w-full caption-bottom text-left text-foreground", tableClassName)}>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-surface-sunken/70 backdrop-blur-md">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="transition-colors">
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
            ))}
          </thead>
          <tbody className="divide-y divide-border-subtle/70 bg-surface">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="h-36 text-center">
                  <div className="flex flex-col items-center justify-center gap-2.5 text-sm text-muted-foreground">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
                    "group transition-colors hover:bg-muted/45 data-[state=selected]:bg-primary/5",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn("align-middle font-normal text-foreground", rowHeightClass)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-36 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1.5 py-6">
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
