"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Calendar, ShieldCheck } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import type { AuditLogPageDto } from "@/features/admin/types/admin.types";

export function AuditLogView({
  page,
  filters,
}: {
  page: AuditLogPageDto;
  filters: { action: string; entityType: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { data, pagination } = page;

  function setParams(next: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") sp.delete(key);
      else sp.set(key, String(value));
    }
    router.push(`/admin/audit-log?${sp.toString()}`);
  }

  function onFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setParams({
      action: (formData.get("action") as string).trim() || undefined,
      entityType: (formData.get("entityType") as string).trim() || undefined,
      page: 1,
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <form
        onSubmit={onFilter}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xs"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="f-action" className="text-[11px] font-medium text-muted-foreground">
            Action Filter
          </label>
          <Input
            id="f-action"
            name="action"
            defaultValue={filters.action}
            placeholder="e.g. FEATURE_FLAG_CHANGED"
            className="h-8 w-56 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="f-entity" className="text-[11px] font-medium text-muted-foreground">
            Entity Type
          </label>
          <Input
            id="f-entity"
            name="entityType"
            defaultValue={filters.entityType}
            placeholder="e.g. Organization"
            className="h-8 w-48 text-xs"
          />
        </div>

        <div className="flex items-end self-end">
          <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Filter className="h-3 w-3" />
            <span>Apply Filter</span>
          </Button>
        </div>
      </form>

      {/* High-Density Audit Log Table with Sticky Header */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        <div className="relative w-full overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full caption-bottom text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs select-none">
              <tr className="h-9">
                <th className="px-4">Timestamp</th>
                <th className="px-4">Action</th>
                <th className="px-4">Target Entity</th>
                <th className="px-4 text-right">Actor ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="h-28 text-center text-xs text-muted-foreground">
                    No audit entries match the active filters.
                  </td>
                </tr>
              ) : (
                data.map((entry) => (
                  <tr
                    key={entry.id}
                    className="group h-10 transition-colors hover:bg-muted/40"
                  >
                    <td className="whitespace-nowrap px-4 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4">
                      <Badge variant="outline" className="font-mono text-[10px] font-semibold text-primary">
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 text-foreground">
                      <span className="font-medium">{entry.entityType}</span>
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        {entry.entityId}
                      </span>
                    </td>
                    <td className="px-4 text-right font-mono text-[11px] text-muted-foreground">
                      {entry.actorId ?? "system"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Integrated DataPagination */}
        <DataPagination
          mode="numbered"
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          itemLabel="audit records"
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
}
