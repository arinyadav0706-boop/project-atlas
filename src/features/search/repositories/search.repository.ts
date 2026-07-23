import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import type {
  SearchIssueRow,
  SearchProjectRow,
} from "@/features/search/types/search.types";

// The swappable search seam (ADR-0021 §2). All query logic lives here; the
// service and UI depend only on the row/DTO shapes. Moving to an external
// engine later is a new implementation of THIS interface — nothing above it
// changes. Prisma is imported only in *.repository.ts (Feature Architecture §4).
//
// The to_tsvector expressions below MUST match the GIN expression indexes in
// migration 20260723130000_search_fts byte-for-byte, or Postgres skips them.

// A prefix tsquery: sanitize to alphanumeric terms (no tsquery-syntax
// injection, BR-4/ADR-0021 §1), append `:*` to each so it matches "as you
// type", and AND the terms together. Returns "" when nothing usable remains.
function toPrefixTsquery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}:*`)
    .join(" & ");
}

// A parameterized ILIKE pattern for issue-key matches (BR-3). LIKE wildcards
// in user input are escaped so they match literally — the value is still bound
// as a parameter, never concatenated into SQL.
function toKeyLike(raw: string): string {
  const escaped = raw.trim().replace(/[%_\\]/g, "\\$&");
  return `%${escaped}%`;
}

const ISSUE_TSV = Prisma.sql`to_tsvector('english', coalesce(i."title", '') || ' ' || coalesce(i."description", ''))`;
const PROJECT_TSV = Prisma.sql`to_tsvector('english', coalesce(p."name", '') || ' ' || coalesce(p."key", ''))`;

export const SearchRepository = {
  // Issues in the caller's org (F-1), non-deleted, matching the body tsvector
  // or the key. Key matches sort first (BR-3), then ts_rank, then recency.
  async searchIssues(
    organizationId: string,
    rawQuery: string,
    limit: number,
  ): Promise<SearchIssueRow[]> {
    const tsquery = toPrefixTsquery(rawQuery);
    const keyLike = toKeyLike(rawQuery);

    const match: Prisma.Sql[] = [Prisma.sql`i."key" ILIKE ${keyLike}`];
    if (tsquery) {
      match.push(Prisma.sql`${ISSUE_TSV} @@ to_tsquery('english', ${tsquery})`);
    }
    const rank = tsquery
      ? Prisma.sql`ts_rank(${ISSUE_TSV}, to_tsquery('english', ${tsquery}))`
      : Prisma.sql`cast(0 as real)`;

    return prisma.$queryRaw<SearchIssueRow[]>`
      SELECT i."id", i."key", i."title", i."projectId", p."key" AS "projectKey"
      FROM "issues" i
      JOIN "projects" p ON p."id" = i."projectId"
      WHERE p."organizationId" = ${organizationId}
        AND i."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
        AND (${Prisma.join(match, " OR ")})
      ORDER BY (i."key" ILIKE ${keyLike}) DESC, ${rank} DESC, i."updatedAt" DESC
      LIMIT ${limit}
    `;
  },

  // Projects in the caller's org (F-1), non-deleted, matching name/key.
  async searchProjects(
    organizationId: string,
    rawQuery: string,
    limit: number,
  ): Promise<SearchProjectRow[]> {
    const tsquery = toPrefixTsquery(rawQuery);
    const keyLike = toKeyLike(rawQuery);

    const match: Prisma.Sql[] = [Prisma.sql`p."key" ILIKE ${keyLike}`];
    if (tsquery) {
      match.push(Prisma.sql`${PROJECT_TSV} @@ to_tsquery('english', ${tsquery})`);
    }
    const rank = tsquery
      ? Prisma.sql`ts_rank(${PROJECT_TSV}, to_tsquery('english', ${tsquery}))`
      : Prisma.sql`cast(0 as real)`;

    return prisma.$queryRaw<SearchProjectRow[]>`
      SELECT p."id", p."key", p."name"
      FROM "projects" p
      WHERE p."organizationId" = ${organizationId}
        AND p."deletedAt" IS NULL
        AND (${Prisma.join(match, " OR ")})
      ORDER BY (p."key" ILIKE ${keyLike}) DESC, ${rank} DESC, p."updatedAt" DESC
      LIMIT ${limit}
    `;
  },
};
