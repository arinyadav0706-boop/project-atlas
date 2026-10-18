"use client";

import { useMemo, useState } from "react";
import { Search, Mail } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { MyTeamReportDto } from "@/features/teams/types/team.types";

export function MyTeamView({ reports }: { reports: MyTeamReportDto[] }) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");

  const teamNames = useMemo(() => {
    return Array.from(new Set(reports.map((r) => r.teamName))).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (teamFilter !== "ALL" && r.teamName !== teamFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [reports, teamFilter, query]);

  const { paginatedItems, paginationProps } = usePagination({
    items: filteredReports,
    initialPageSize: 12,
    itemLabel: "reports",
    resetDeps: [query, teamFilter],
  });

  return (
    <div className="space-y-5">
      {/* Control Bar: Search + Segmented Team Filter */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports by name or email…"
            className="pl-10 rounded-full"
          />
        </div>

        {teamNames.length > 1 && (
          <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-surface-sunken/80 p-1">
            <button
              type="button"
              onClick={() => setTeamFilter("ALL")}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                teamFilter === "ALL"
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
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
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                    teamFilter === teamName
                      ? "bg-surface text-foreground shadow-xs ring-1 ring-border/50"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {teamName} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bento Team Member Cards */}
      {filteredReports.length === 0 ? (
        <div className="rounded-3xl border border-border/60 bg-surface p-12 text-center text-sm text-muted-foreground shadow-card">
          No team members match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedItems.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-4 rounded-3xl border border-border/60 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover"
              >
                <Avatar className="h-12 w-12 ring-2 ring-primary/15">
                  {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                  <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-primary/20 to-google-purple/20 text-primary">
                    {r.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-foreground">
                    {r.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{r.email}</span>
                  </span>
                  <div className="mt-2.5">
                    <Badge variant="primary" dot>
                      {r.teamName}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-card">
            <DataPagination {...paginationProps} pageSizeOptions={[6, 12, 24]} />
          </div>
        </div>
      )}
    </div>
  );
}
