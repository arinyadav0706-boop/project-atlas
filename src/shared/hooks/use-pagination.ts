"use client";

import { useMemo, useState, useEffect } from "react";
import type { NumberedPaginationProps } from "@/shared/components/ui/data-pagination";

export interface UsePaginationOptions<T> {
  items: T[];
  initialPageSize?: number;
  initialPage?: number;
  itemLabel?: string;
  /** Dependencies that, when changed, should reset the page back to 1 (e.g. search query, filters) */
  resetDeps?: unknown[];
}

export interface UsePaginationResult<T> {
  paginatedItems: T[];
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  paginationProps: NumberedPaginationProps;
}

export function usePagination<T>({
  items,
  initialPageSize = 25,
  initialPage = 1,
  itemLabel = "records",
  resetDeps = [],
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // When search/filter dependencies change, reset page to 1
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Ensure current page is within valid bounds
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  if (validPage !== currentPage && totalItems > 0) {
    setCurrentPage(validPage);
  }

  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  const paginationProps: NumberedPaginationProps = useMemo(() => {
    return {
      mode: "numbered",
      page: validPage,
      pageSize,
      total: totalItems,
      itemLabel,
      onPageChange: (p: number) => setCurrentPage(Math.min(Math.max(1, p), totalPages)),
      onPageSizeChange: (s: number) => {
        setPageSize(s);
        setCurrentPage(1);
      },
    };
  }, [validPage, pageSize, totalItems, itemLabel, totalPages]);

  return {
    paginatedItems,
    currentPage: validPage,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    setPage: setCurrentPage,
    setPageSize,
    paginationProps,
  };
}
