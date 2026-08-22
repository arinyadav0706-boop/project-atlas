import type { StatusCategoryDto } from "@/features/workflow/types/workflow.types";

// The statuses every project starts with (30_workflow BR-7).
//
// Exactly the four the product hard-coded before statuses became data, with the
// same names and the same colours the UI already rendered per category — so a
// team that never opens the editor sees the board it saw yesterday, and the
// migration that seeded existing projects and the code that seeds new ones
// agree by construction rather than by memory.
//
// Kept as a pure module so both the seeding path and the tests can read it
// without touching Prisma.

export interface StatusSeed {
  name: string;
  category: StatusCategoryDto;
  color: string;
  position: number;
  isDefault: boolean;
}

export const DEFAULT_STATUSES: readonly StatusSeed[] = [
  { name: "To Do", category: "TODO", color: "slate", position: 0, isDefault: true },
  { name: "In Progress", category: "IN_PROGRESS", color: "sky", position: 1, isDefault: false },
  { name: "In Review", category: "IN_REVIEW", color: "amber", position: 2, isDefault: false },
  { name: "Done", category: "DONE", color: "emerald", position: 3, isDefault: false },
] as const;

/**
 * The colours a status may take.
 *
 * Token names, never hex: a status stored as `#0ea5e9` is a status that looks
 * wrong in one of the two themes, forever, and nobody will remember why.
 */
export const STATUS_COLORS = [
  "slate",
  "sky",
  "amber",
  "emerald",
  "violet",
  "rose",
  "orange",
  "teal",
] as const;

export type StatusColor = (typeof STATUS_COLORS)[number];

/** What a category is called in the UI. */
export const CATEGORY_LABEL: Record<StatusCategoryDto, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

/**
 * What a category MEANS, shown next to the selector.
 *
 * Choosing a category is the one part of adding a status that has consequences
 * beyond the board — it decides whether the work counts as finished in reports,
 * whether it unblocks its dependents, and whether it still sits in someone's
 * workload. A picker that just lists four enum values invites people to pick by
 * name and be surprised later.
 */
export const CATEGORY_HELP: Record<StatusCategoryDto, string> = {
  TODO: "Not started. Counts as open work everywhere.",
  IN_PROGRESS: "Being worked on. Counts toward a person's load.",
  IN_REVIEW: "Waiting on someone else — review, QA, approval.",
  DONE: "Finished. Leaves the workload, closes the sprint item, and unblocks anything waiting on it.",
};
