import { cn } from "@/shared/lib/utils";
import {
  PriorityIcon,
  priorityLabel,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import type {
  IssuePriorityDto,
  IssueStatusDto,
} from "@/features/issues/types/issue.types";

// Tinted status and priority pills, from the approved Home reference. Text sits
// a shade darker than its tint so every pill passes 4.5:1 — the reference's own
// orange-on-cream does not, and a pill nobody can read is decoration.

const STATUS_TONE: Record<IssueStatusDto, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  IN_REVIEW: "bg-amber-50 text-amber-800",
  DONE: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_TONE: Record<IssuePriorityDto, string> = {
  HIGHEST: "bg-rose-50 text-rose-700",
  HIGH: "bg-rose-50 text-rose-700",
  MEDIUM: "bg-amber-50 text-amber-800",
  LOW: "bg-sky-50 text-sky-700",
  LOWEST: "bg-slate-100 text-slate-600",
};

const PILL =
  "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap";

export function StatusPill({ status }: { status: IssueStatusDto }) {
  return <span className={cn(PILL, STATUS_TONE[status])}>{statusLabel(status)}</span>;
}

export function PriorityPill({ priority }: { priority: IssuePriorityDto }) {
  return (
    <span className={cn(PILL, "pl-1", PRIORITY_TONE[priority])}>
      {/* The pill's own colour, not the icon's palette colour: one hue per pill. */}
      <PriorityIcon priority={priority} className="size-3 text-current" />
      {priorityLabel(priority)}
    </span>
  );
}
