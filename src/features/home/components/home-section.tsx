import { Panel } from "@/shared/components/data/panel";
import { EmptyState } from "@/shared/components/ui/empty-state";

// Home's section wrapper.
//
// It is now a thin pass-through to the shared `Panel`, and that is the point:
// the header grammar (icon, title, count, link) is the same one Dashboards and
// the issue detail page will use, so restyling it restyles all three rather
// than three of them drifting apart.
//
// Kept as its own name rather than calling `Panel` at five call sites, because
// Home's sections share one more thing — they are all capped lists whose count
// may be a floor — and that default lives here.
export function HomeSection({
  title,
  count,
  countLabel,
  countTruncated,
  viewAll,
  tabs,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  /** Singular noun, pluralised automatically: "open issue" → "2 open issues". */
  countLabel?: string;
  /** The list is capped and there are more — renders "10+". */
  countTruncated?: boolean;
  viewAll?: { href: string; label?: string };
  /** Panel views, placed right after the title. */
  tabs?: React.ReactNode;
  /** Header control left of "View all". */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel
      title={title}
      count={count}
      countLabel={countLabel}
      countTruncated={countTruncated}
      link={viewAll}
      tabs={tabs}
      action={action}
      className={className}
    >
      {children}
    </Panel>
  );
}

// The count pill sits in the header, so an empty section needs no number —
// it needs a sentence. Compact by default: these live inside panels that share
// a row, and a full-height empty state would stretch its neighbour.
export function HomeEmpty({
  children,
  icon,
  title,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}) {
  return (
    <EmptyState
      compact
      icon={icon}
      title={title ?? "Nothing here yet"}
      description={typeof children === "string" ? children : undefined}
    />
  );
}
