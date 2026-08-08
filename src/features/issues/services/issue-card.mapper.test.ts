import { describe, expect, it } from "vitest";
import { toIssueCardDto, type IssueCardRow } from "./issue-card.mapper";
import { issueCardSelect } from "@/features/issues/repositories/issue-card.repository";

// The regression this file exists for.
//
// Board, Backlog and the Issues list each had their own `cardSelect` and their
// own row→DTO mapper. Classification chips were added to two of the three, so
// the Issues list rendered issues with no labels, components or epic badge —
// and the Backlog's copy omitted the `deletedAt` guard the Board's had, so a
// soft-deleted label would still have shown. Same bug twice: N copies, N-1
// updated.
//
// One select and one mapper now serve all three, and these tests pin both.

const row = (over: Partial<IssueCardRow> = {}): IssueCardRow => ({
  id: "i1",
  projectId: "p1",
  key: "VWP-1",
  type: "STORY",
  title: "Retry the payment webhook",
  status: "TODO",
  priority: "HIGH",
  storyPoints: 5,
  updatedAt: new Date("2026-08-07T00:00:00.000Z"),
  version: 3,
  assignee: null,
  ...over,
});

describe("toIssueCardDto carries the whole card", () => {
  it("flattens labels and components out of their join rows", () => {
    const dto = toIssueCardDto(
      row({
        labels: [{ label: { id: "l1", name: "backend", color: "#2563eb" } }],
        components: [{ component: { id: "c1", name: "Payments" } }],
      }),
    );
    // The client sees the entity, never `{ label: { … } }`.
    expect(dto.labels).toEqual([{ id: "l1", name: "backend", color: "#2563eb" }]);
    expect(dto.components).toEqual([{ id: "c1", name: "Payments" }]);
  });

  it("exposes the parent epic as both id and key", () => {
    const dto = toIssueCardDto(row({ epicId: "e1", epic: { id: "e1", key: "VWP-9" } }));
    expect(dto.epicId).toBe("e1");
    expect(dto.epicKey).toBe("VWP-9");
  });

  it("returns empty arrays — never undefined — for an unclassified issue", () => {
    // `IssueChips` reads `.length`; undefined here would have been a crash on
    // any surface that forgot to default it.
    const dto = toIssueCardDto(row());
    expect(dto.labels).toEqual([]);
    expect(dto.components).toEqual([]);
    expect(dto.epicId).toBeNull();
    expect(dto.epicKey).toBeUndefined();
  });

  it("serialises updatedAt and preserves the OCC version", () => {
    const dto = toIssueCardDto(row());
    expect(dto.updatedAt).toBe("2026-08-07T00:00:00.000Z");
    expect(dto.version).toBe(3);
  });
});

describe("issueCardSelect is the single source of the card's shape", () => {
  it("asks for the chip relations, so no surface can silently omit them", () => {
    expect(issueCardSelect).toHaveProperty("labels");
    expect(issueCardSelect).toHaveProperty("components");
    expect(issueCardSelect).toHaveProperty("epic");
  });

  it("filters soft-deleted labels and components out of the join", () => {
    // Load-bearing: a deleted label must stop appearing on cards, not linger
    // because its join row survived. The Backlog's old copy missed this.
    expect(issueCardSelect.labels.where).toEqual({ label: { deletedAt: null } });
    expect(issueCardSelect.components.where).toEqual({ component: { deletedAt: null } });
  });
});
