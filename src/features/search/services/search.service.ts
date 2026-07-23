import type { Actor } from "@/shared/types/actor";
import { SearchRepository } from "@/features/search/repositories/search.repository";
import { MIN_QUERY_LEN } from "@/features/search/validation/search.schemas";
import type { SearchResponseDto } from "@/features/search/types/search.types";

// Per-group caps (BR-6) — the palette shows a handful per group, not a page.
// A full, paginated results page is Future Scope.
const ISSUE_LIMIT = 5;
const PROJECT_LIMIT = 5;

export const SearchService = {
  // RBAC is org-scope (ADR-0021 §3): any authenticated org member may search;
  // the repository filters to the actor's organization (F-1) and non-deleted
  // rows. A too-short query short-circuits to empty (BR-5) — no DB round-trip.
  async search(actor: Actor, rawQuery: string): Promise<SearchResponseDto> {
    const q = rawQuery.trim();
    if (q.length < MIN_QUERY_LEN) return { issues: [], projects: [] };

    const [issueRows, projectRows] = await Promise.all([
      SearchRepository.searchIssues(actor.organizationId, q, ISSUE_LIMIT),
      SearchRepository.searchProjects(actor.organizationId, q, PROJECT_LIMIT),
    ]);

    return {
      issues: issueRows.map((row) => ({
        id: row.id,
        key: row.key,
        title: row.title,
        projectKey: row.projectKey,
        href: `/projects/${row.projectId}/issues/${row.id}`,
      })),
      projects: projectRows.map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        href: `/projects/${row.id}/issues`,
      })),
    };
  },
};
