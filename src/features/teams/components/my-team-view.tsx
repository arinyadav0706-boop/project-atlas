"use client";

import { useMemo, useState } from "react";
import { Search, Users, Mail, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { MyTeamReportDto } from "@/features/teams/types/team.types";

export function MyTeamView({ reports }: { reports: MyTeamReportDto[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");

  // Distinct team names
  const teamNames = useMemo(() => {
    return Array.from(new Set(reports.map((r) => r.teamName))).sort();
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (teamFilter !== "ALL" && r.teamName !== teamFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [reports, teamFilter, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredReports,
    initialPageSize: 12,
    itemLabel: "reports",
    resetDeps: [query, teamFilter],
  });

  return (
    <div className="space-y-4">
      {/* Control Bar: Search + Team Filter */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports by name or email…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {teamNames.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTeamFilter("ALL")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                teamFilter === "ALL"
                  ? "bg-surface font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Teams ({reports.length})
            </button>
            {teamNames.map((teamName) => {
              const count = reports.filter((r) => r.teamName === teamName).length;
              return (
                <button
                  key={teamName}
                  type="button"
                  onClick={() => setTeamFilter(teamName)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                    teamFilter === teamName
                      ? "bg-surface font-semibold text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {teamName} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginated Team List */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No team members match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-border/60">
            {paginatedItems.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-3 bg-surface p-4 transition-colors hover:bg-muted/30"
              >
                <Avatar className="h-9 w-9 ring-1 ring-border">
                  {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                  <AvatarFallback className="text-xs font-semibold">
                    {r.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-foreground">{r.name}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.email}</div>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {r.teamName}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DataPagination {...paginationProps} pageSizeOptions={[6, 12, 24]} />
      </div>
    </div>
  );
}
