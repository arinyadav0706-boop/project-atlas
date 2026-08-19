import { Ban } from "lucide-react";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import { selectChips } from "@/features/issues/lib/select-chips";
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
  showComponents = true,
}: {
  item: Pick<
    IssueListItemDto,
    "epicKey" | "parentKey" | "blockedBy" | "labels" | "components"
  >;
  className?: string;
  /**
   * Cap the chips, collapsing the rest into a "+N". Dense single-line rows pass
   * this; the board card, which is a 2-D surface where wrapping is fine, leaves
   * it off. Clipping with `overflow-hidden` looked broken — half a pill reads as
   * a rendering bug, where "+5" reads as information.
   *
   * The epic badge counts against this. It didn't, so `max={3}` rendered four
   * chips plus a "+N" — five objects competing with the title.
   */
  max?: number;
  /**
   * Drop component chips. The Issues list is a single dense line, and its
   * budget is better spent on labels; components stay on the board card and the
   * issue detail. Jira makes the same call — its backlog rows show the epic, not
   * the full classification.
   */
  showComponents?: boolean;
}) {
  const {
    labels: shownLabels,
    components: shownComponents,
    hidden,
  } = selectChips(item, { max, showComponents });

  if (
    !item.epicKey &&
    !item.parentKey &&
    !item.blockedBy &&
    shownLabels.length === 0 &&
    shownComponents.length === 0 &&
    !hidden.length
  ) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {/* A subtask's parent, first and uncapped (26_subtasks BR-5). Uncapped
          because it is not classification — without it a subtask card on the
          board is an orphan sentence ("Write the tests" — for what?), and a
          chip that sometimes collapses into "+2" would leave that card
          meaningless at random. */}
      {/* Blocked, first and uncapped (ADR-0046 §7). The one chip that changes
          whether you should pick this card up at all — burying it behind "+2"
          would defeat the point of having it. */}
      {Boolean(item.blockedBy) && (
        <span
          className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
          title={`Waiting on ${item.blockedBy} unfinished ${item.blockedBy === 1 ? "issue" : "issues"}`}
        >
          <Ban className="h-2.5 w-2.5" />
          Blocked{item.blockedBy! > 1 ? ` ×${item.blockedBy}` : ""}
        </span>
      )}
      {item.parentKey && (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <IssueTypeIcon type="SUBTASK" className="h-2.5 w-2.5" />
          {item.parentKey}
        </span>
      )}
      {item.epicKey && (
        <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          <IssueTypeIcon type="EPIC" className="h-2.5 w-2.5" />
          {item.epicKey}
        </span>
      )}
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
      {shownComponents.map((component) => (
        <span
          key={component.id}
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {component.name}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] text-muted-foreground"
          title={hidden.map((c) => c.name).join(", ")}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}
