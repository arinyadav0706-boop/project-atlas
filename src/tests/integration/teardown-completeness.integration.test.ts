import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";

// Tier 4 — the VERUS teardown is complete (backlog GIT-7).
//
// This test exists because a comment asking people to remember failed three
// times. SEED-9, then GIT-6 (ten tables at once, across modules 30-34), then a
// third manual check while building module 35. Each time the teardown was fixed
// and a note was added asking the next person to run a query. Each time the
// next person did not.
//
// So the query runs here instead. It finds every table with a foreign key into
// the org/project/issue spine — the tables a `deleteMany` for one organization
// must account for — and fails naming any the teardown neither deletes nor
// reaches by cascade.
//
// A failure is not a bug in this test. It means a table was added and the
// teardown was not updated, and re-seeding VERUS will die on a bare P2003.

const TEARDOWN_PATH = join(process.cwd(), "prisma/verus/teardown.ts");

/**
 * Tables the teardown does NOT delete by name because a parent's
 * `ON DELETE CASCADE` takes them.
 *
 * Every entry is checked against the live schema below — an exemption is a
 * claim about a foreign key, and a claim that stops being true is worse than no
 * exemption at all. Tables the teardown deletes explicitly do not belong here,
 * even when they also happen to cascade.
 */
const CASCADED: Record<string, string> = {
  code_credentials: "cascades from code_connections",
  code_repositories: "cascades from code_connections",
  code_backfill_runs: "cascades from code_repositories",
  dashboard_widgets: "cascades from dashboards",
};

/**
 * Tables the teardown deliberately does not clear, with the reason.
 *
 * `users` and `organizations` are the teardown's subject rather than its
 * targets — it adopts users into another org and deletes the organization
 * itself at the end. `issues` and `projects` reference themselves (parent
 * issue, and the spine tables appear in their own FK list).
 */
const NOT_APPLICABLE = new Set(["users", "organizations", "issues", "projects"]);

/** `code_backfill_runs` → `codeBackfillRun`, matching the Prisma delegate. */
function delegateName(table: string): string {
  const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  // Prisma singularises the model, and the mapping is not mechanical
  // (`statuses` → `status`), so accept either form when scanning the source.
  return camel;
}

function candidateMentions(table: string): string[] {
  const camel = delegateName(table);
  const forms = new Set([camel]);
  // `saved_views` → `savedView`, `custom_field_entries` → `customFieldEntry`,
  // and the one that caught this test out: `workflow_statuses` →
  // `workflowStatus`, where the plural added `es` to a word already ending `s`.
  if (camel.endsWith("ies")) forms.add(`${camel.slice(0, -3)}y`);
  if (camel.endsWith("ses")) forms.add(camel.slice(0, -2));
  if (camel.endsWith("s")) forms.add(camel.slice(0, -1));
  return [...forms].map((form) => `prisma.${form}.`);
}

describe("the VERUS teardown accounts for every table on the org spine", () => {
  afterAll(() => prisma.$disconnect());

  it("names, deletes or cascades every table with an FK into org/project/issue", async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
      SELECT DISTINCT tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = ANY (ARRAY['issues','projects','organizations'])
        AND tc.table_name <> ccu.table_name
      ORDER BY 1
    `);

    const source = readFileSync(TEARDOWN_PATH, "utf8");
    const unaccounted = rows
      .map((row) => row.table_name)
      .filter((table) => !NOT_APPLICABLE.has(table))
      // Source first, then cascades: a table the teardown deletes by name is
      // accounted for whether or not it also cascades, which keeps CASCADED to
      // the entries that are actually load-bearing.
      .filter((table) => !candidateMentions(table).some((form) => source.includes(form)))
      .filter((table) => !(table in CASCADED));

    // The message is the whole value of this test: it has to tell somebody who
    // has never read this file what to do next.
    expect(
      unaccounted,
      unaccounted.length === 0
        ? ""
        : `prisma/verus/teardown.ts does not account for: ${unaccounted.join(", ")}.\n` +
          `Add a deleteMany in dependency order, or — if the rows disappear via a ` +
          `parent's ON DELETE CASCADE — add the table to CASCADED in this test with ` +
          `the parent named. Until then, re-seeding VERUS fails with a bare P2003.`,
    ).toEqual([]);
  });

  it("does not carry stale CASCADED entries for tables that no longer exist", async () => {
    // A cascade exemption that outlives its table is a hole: the next table to
    // reuse that name inherits an exemption nobody granted it.
    const existing = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = new Set(existing.map((row) => row.table_name));
    expect(Object.keys(CASCADED).filter((table) => !names.has(table))).toEqual([]);
  });

  it("every CASCADED table really is reached by a cascade", async () => {
    // The exemption list is a claim about the schema. Check it against the
    // schema rather than trusting the comment beside it — a cascade that was
    // quietly changed to RESTRICT would otherwise silently break re-seeding.
    const rows = await prisma.$queryRawUnsafe<{ table_name: string; delete_rule: string }[]>(`
      SELECT tc.table_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ANY ($1::text[])
    `, Object.keys(CASCADED));

    const cascading = new Set(
      rows.filter((row) => row.delete_rule === "CASCADE").map((row) => row.table_name),
    );
    const claimed = Object.keys(CASCADED).filter((table) => !cascading.has(table));
    expect(
      claimed,
      `These are exempted as cascading but have no ON DELETE CASCADE: ${claimed.join(", ")}`,
    ).toEqual([]);
  });
});
