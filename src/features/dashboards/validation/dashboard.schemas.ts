import { z } from "zod";
import { issueFilterSchema } from "@/features/issues/validation/issue-filter.schemas";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/25_dashboards.md §7.

export const MAX_DASHBOARD_NAME = 80;
export const MAX_WIDGET_TITLE = 60;
/** Beyond this it is a report, not a dashboard, and the batched load stops
 *  being one cheap request (BR-7). */
export const MAX_WIDGETS = 12;
/** A 200-person org must not render 200 bars (BR-10). */
export const MAX_BREAKDOWN_SLICES = 12;
export const LIST_WIDGET_ROWS = 10;

export const dashboardVisibility = z.enum(["PRIVATE", "SHARED"]);
export const widgetType = z.enum(["STAT", "BREAKDOWN", "LIST"]);
export const widgetWidth = z.enum(["SMALL", "MEDIUM", "LARGE"]);
export const breakdownBy = z.enum(["STATUS", "PRIORITY", "TYPE", "ASSIGNEE"]);

export const createDashboardSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(MAX_DASHBOARD_NAME),
  visibility: dashboardVisibility.default("PRIVATE"),
});

export const updateDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_DASHBOARD_NAME).optional(),
    visibility: dashboardVisibility.optional(),
  })
  .strict();

export const widgetSchema = z
  .object({
    /** Present when editing an existing widget; absent means create. */
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1, "Title is required").max(MAX_WIDGET_TITLE),
    type: widgetType,
    width: widgetWidth.default("SMALL"),
    filter: issueFilterSchema.default({}),
    savedViewId: z.string().trim().min(1).nullable().optional(),
    breakdownBy: breakdownBy.nullable().optional(),
  })
  // A BREAKDOWN with no dimension has nothing to group by; a STAT with one is
  // carrying a setting that does nothing. Both are rejected rather than
  // silently normalised, so a bad client learns instead of guessing.
  .refine((w) => (w.type === "BREAKDOWN" ? Boolean(w.breakdownBy) : !w.breakdownBy), {
    message: "Choose what to group by (breakdown widgets only).",
    path: ["breakdownBy"],
  });

export const setWidgetsSchema = z.object({
  // The array's order IS the display order, so there is no separate reorder
  // call that could disagree with it.
  widgets: z.array(widgetSchema).max(MAX_WIDGETS, `A dashboard can hold at most ${MAX_WIDGETS} widgets.`),
});

export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;
export type WidgetInput = z.infer<typeof widgetSchema>;
export type SetWidgetsInput = z.infer<typeof setWidgetsSchema>;
