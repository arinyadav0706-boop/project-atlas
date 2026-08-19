import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { CrossProjectIssueDto } from "@/features/saved-views/types/saved-view.types";

// DTOs for dashboards (ADR-0044, docs/02_Modules/25_dashboards.md).

export type DashboardVisibilityDto = "PRIVATE" | "SHARED";
export type WidgetTypeDto = "STAT" | "BREAKDOWN" | "LIST";
export type WidgetWidthDto = "SMALL" | "MEDIUM" | "LARGE";
export type BreakdownByDto = "STATUS" | "PRIORITY" | "TYPE" | "ASSIGNEE";

export interface DashboardWidgetDto {
  id: string;
  title: string;
  type: WidgetTypeDto;
  width: WidgetWidthDto;
  position: number;
  filter: IssueFilter;
  savedViewId: string | null;
  /** Resolved for display, so a widget can name its source without a lookup. */
  savedViewName: string | null;
  breakdownBy: BreakdownByDto | null;
  /** The stored filter failed validation and was replaced (BR-12). */
  filterCorrupt: boolean;
}

export interface DashboardDto {
  id: string;
  name: string;
  visibility: DashboardVisibilityDto;
  owner: { id: string; name: string };
  canEdit: boolean;
  widgets: DashboardWidgetDto[];
}

/** Rail entry — no widgets, so listing is one cheap query. */
export interface DashboardSummaryDto {
  id: string;
  name: string;
  visibility: DashboardVisibilityDto;
  owner: { id: string; name: string };
  canEdit: boolean;
  widgetCount: number;
}

export interface BreakdownSliceDto {
  key: string;
  label: string;
  count: number;
}

/**
 * One widget's computed data.
 *
 * `unavailable` covers a widget whose saved view the viewer cannot see (BR-5):
 * it renders as unavailable rather than falling back to unfiltered, because
 * "everything" is a WIDER set than was intended and showing it silently would
 * be the wrong kind of failure.
 */
export type WidgetDataDto =
  | { widgetId: string; kind: "stat"; count: number; projectsInScope: number }
  | {
      widgetId: string;
      kind: "breakdown";
      slices: BreakdownSliceDto[];
      total: number;
      projectsInScope: number;
    }
  | {
      widgetId: string;
      kind: "list";
      items: CrossProjectIssueDto[];
      total: number;
      projectsInScope: number;
    }
  | { widgetId: string; kind: "unavailable"; reason: string };
