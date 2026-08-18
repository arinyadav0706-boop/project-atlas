"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import type { AuditLogPageDto } from "@/features/admin/types/admin.types";

// Read-only audit trail (13_admin.md BR-2). Filters + pagination live in the
// URL, so the server component re-queries — the client just navigates.
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
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

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
      page: 1, // a new filter resets to the first page
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onFilter} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="f-action" className="text-xs text-muted-foreground">
            Action
          </label>
          <Input
            id="f-action"
            name="action"
            defaultValue={filters.action}
            placeholder="e.g. FEATURE_FLAG_CHANGED"
            className="h-9 w-56"
          />
        </div>
        <div>
          <label htmlFor="f-entity" className="text-xs text-muted-foreground">
            Entity type
          </label>
          <Input
            id="f-entity"
            name="entityType"
            defaultValue={filters.entityType}
            placeholder="e.g. Organization"
            className="h-9 w-48"
          />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Actor</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No audit entries match.
                </td>
              </tr>
            )}
            {data.map((entry) => (
              <tr key={entry.id} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {entry.action}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {entry.entityType}
                  <span className="ml-1 font-mono text-xs opacity-60">{entry.entityId}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {entry.actorId ?? "system"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {pagination.total} {pagination.total === 1 ? "entry" : "entries"} · page{" "}
          {pagination.page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() => setParams({ page: pagination.page - 1 })}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page >= totalPages}
            onClick={() => setParams({ page: pagination.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
