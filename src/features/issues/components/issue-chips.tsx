import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// Epic / component / label chips for an issue, in one place (ADR-0018, ADR-0026).
//
// Promoted out of the board card so a backlog row and a board card describe the
// same issue identically. Two hand-rolled chip rows would have drifted in
// colour, order and spacing the first time either was touched.
//
// Renders nothing when the issue carries no classification — an empty chip row
// would add vertical rhythm to some rows and not others.
export function IssueChips({
  item,
  className,
  max,
}: {
  item: Pick<IssueListItemDto, "epicKey" | "labels" | "components">;
  className?: string;
  /**
   * Cap the classification chips (components + labels), collapsing the rest
   * into a "+N". Dense single-line rows pass this; the board card, which is a
   * 2-D surface where wrapping is fine, leaves it off. Clipping chips with
   * `overflow-hidden` looked broken — half a pill reads as a rendering bug,
   * where "+5" reads as information.
   */
  max?: number;
}) {
  const components = item.components ?? [];
  const labels = item.labels ?? [];
  const hasAny = Boolean(item.epicKey) || components.length > 0 || labels.length > 0;
  if (!hasAny) return null;

  const total = components.length + labels.length;
  const limit = max ?? total;
  const shownComponents = components.slice(0, limit);
  const shownLabels = labels.slice(0, Math.max(limit - shownComponents.length, 0));
  const hidden = total - shownComponents.length - shownLabels.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {item.epicKey && (
        <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          <IssueTypeIcon type="EPIC" className="h-2.5 w-2.5" />
          {item.epicKey}
        </span>
      )}
      {shownComponents.map((component) => (
        <span
          key={component.id}
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {component.name}
        </span>
      ))}
      {shownLabels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px]"
        >
          {/* The label's own colour is user data, so it stays an inline style —
              it cannot come from a theme token. */}
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
          {label.name}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] text-muted-foreground"
          title={[...components, ...labels].map((c) => c.name).join(", ")}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}
