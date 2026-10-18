import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Badge } from "@/shared/components/ui/badge";

export function HomeSection({
  title,
  icon,
  count,
  countLabel,
  viewAll,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  countLabel?: string;
  viewAll?: { href: string; label?: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className} flush>
      <CardHeader
        icon={icon}
        title={title}
        action={
          <div className="flex items-center gap-2">
            {count !== undefined && count > 0 && countLabel && (\n              <Badge variant=\"primary\" className=\"tabular-nums\">
                {count} {countLabel}
                {count === 1 ? \"\" : \"s\"}
              </Badge>
            )}
            {viewAll && (
              <Link
                href={viewAll.href}
                className=\"inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline transition-opacity\"
              >
                {viewAll.label ?? \"View all\"}
                <ArrowRight className=\"h-3 w-3\" />
              </Link>
            )}
          </div>
        }
      />
      <div className=\"p-0 overflow-hidden\">{children}</div>
    </Card>
  );
}

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
    <div className=\"p-4\">
      <EmptyState
        compact
        icon={icon}
        title={title ?? \"Nothing here yet\"}
        description={typeof children === \"string\" ? children : undefined}
      />
    </div>
  );
}
