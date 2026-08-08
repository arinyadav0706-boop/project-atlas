import { describe, expect, it } from "vitest";
import { generateVerus } from "../../../prisma/verus/generate";
import { LABELS } from "../../../prisma/verus/data";
import { labelColorSchema } from "./validation/label.schemas";

// The gap this file exists for.
//
// Labels shipped complete — schema, service, RBAC, chips, filter — and the
// VERUS demo seed created exactly zero of them. Every unit test passed against
// fixtures, and no path was ever exercised against real data: the chip row, the
// `label` filter, the soft-delete guard in `issueCardSelect`. "Green tests and
// an empty table" is how the burndown flat-line got to production, so this
// asserts the demo data can actually exercise the feature.
//
// Replays the ACTUAL generated dataset. No database, no fixtures.

const dataset = generateVerus();

const labelIds = new Set(dataset.labels.map((l) => l.id!));
const countByIssue = new Map<string, number>();
for (const il of dataset.issueLabels) {
  countByIssue.set(il.issueId, (countByIssue.get(il.issueId) ?? 0) + 1);
}
const countByLabel = new Map<string, number>();
for (const il of dataset.issueLabels) {
  countByLabel.set(il.labelId, (countByLabel.get(il.labelId) ?? 0) + 1);
}

describe("the VERUS demo data creates real labels", () => {
  it("creates the whole pool, org-scoped", () => {
    expect(dataset.labels).toHaveLength(LABELS.length);
    // Labels belong to the ORGANIZATION, not a project — unlike components.
    // One `regression` row is shared by all four projects.
    for (const label of dataset.labels) {
      expect(label.organizationId).toBe(dataset.org.id);
    }
  });

  it("gives every label a colour the API would accept", () => {
    // The seed writes straight to the table, bypassing the service — so a
    // colour the picker could never produce would sit in the demo undetected
    // until the chip rendered wrong.
    for (const label of dataset.labels) {
      expect(labelColorSchema.safeParse(label.color).success).toBe(true);
    }
  });

  it("uses distinct names, case-insensitively", () => {
    // A functional partial unique index on lower(name) enforces this in the
    // database (ADR-0018 §2, BR-3); a duplicate here would abort the seed.
    const lowered = dataset.labels.map((l) => l.name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });
});

describe("labels are attached widely enough to exercise the feature", () => {
  it("references only labels the seed created", () => {
    const orphans = dataset.issueLabels.filter((il) => !labelIds.has(il.labelId));
    expect(orphans).toEqual([]);
  });

  it("never attaches the same label to an issue twice", () => {
    // (issueId, labelId) is the composite primary key — a duplicate is not a
    // cosmetic flaw, it fails the insert.
    const pairs = dataset.issueLabels.map((il) => `${il.issueId}::${il.labelId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("labels a majority of issues but leaves plenty bare", () => {
    // Both sides matter. All-labelled would never render the empty chip row;
    // all-bare is the bug this file was written for.
    const total = dataset.issues.length;
    const labelled = countByIssue.size;
    expect(labelled / total).toBeGreaterThan(0.4);
    expect(labelled / total).toBeLessThan(0.9);
  });

  it("puts 4+ labels on some issues, so chip overflow (+N) is reachable", () => {
    const crowded = [...countByIssue.values()].filter((n) => n >= 4);
    expect(crowded.length).toBeGreaterThan(0);
  });

  it("uses every label, so no filter option returns an empty list", () => {
    for (const label of dataset.labels) {
      expect(countByLabel.get(label.id!) ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps the distribution uneven, the way a real backlog is", () => {
    // Equal usage would exercise the code and prove nothing about the filter:
    // the point of `security` is that it returns a short list.
    const counts = [...countByLabel.values()].sort((a, b) => b - a);
    expect(counts[0]!).toBeGreaterThan(counts[counts.length - 1]! * 3);
  });

  it("skews type-affine labels towards the type they belong to", () => {
    const typeById = new Map(dataset.issues.map((i) => [i.id!, i.type]));
    const regressionId = dataset.labels.find((l) => l.name === "regression")!.id!;
    const tagged = dataset.issueLabels.filter((il) => il.labelId === regressionId);
    const bugs = tagged.filter((il) => typeById.get(il.issueId) === "BUG").length;
    // A regression is a bug that came back. Mostly-stories would mean the
    // affinity table is not wired in.
    expect(bugs / tagged.length).toBeGreaterThan(0.5);
  });
});
