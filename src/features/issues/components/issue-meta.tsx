import {
  Zap,
  Bookmark,
  SquareCheck,
  Bug,
  GitBranch,
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronDown,
  ChevronsDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type {
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// Status/type/priority color is the one sanctioned use of saturated color
// (Design Principles §2) — always paired with a shape/label, never color
// alone. Tailwind color-500 tokens read correctly in light and dark.

const TYPE: Record<IssueTypeDto, { icon: LucideIcon; color: string; label: string }> = {
  EPIC: { icon: Zap, color: "text-violet-500", label: "Epic" },
  STORY: { icon: Bookmark, color: "text-emerald-500", label: "Story" },
  TASK: { icon: SquareCheck, color: "text-sky-500", label: "Task" },
  BUG: { icon: Bug, color: "text-rose-500", label: "Bug" },
  // Deliberately the quietest of the five (ADR-0045 §6): subtasks share the
  // board with standalone issues, and giving them a sixth saturated colour
  // would make a broken-down story shout louder than an unbroken one.
  SUBTASK: { icon: GitBranch, color: "text-slate-400", label: "Subtask" },
};

const PRIORITY: Record<IssuePriorityDto, { icon: LucideIcon; color: string; label: string }> = {
  HIGHEST: { icon: ChevronsUp, color: "text-rose-500", label: "Highest" },
  HIGH: { icon: ChevronUp, color: "text-orange-500", label: "High" },
  MEDIUM: { icon: Minus, color: "text-amber-500", label: "Medium" },
  LOW: { icon: ChevronDown, color: "text-sky-500", label: "Low" },
  LOWEST: { icon: ChevronsDown, color: "text-slate-400", label: "Lowest" },
};

const STATUS: Record<IssueStatusDto, { dot: string; label: string }> = {
  TODO: { dot: "bg-slate-400", label: "To Do" },
  IN_PROGRESS: { dot: "bg-sky-500", label: "In Progress" },
  IN_REVIEW: { dot: "bg-amber-500", label: "In Review" },
  DONE: { dot: "bg-emerald-500", label: "Done" },
};

export const typeLabel = (t: IssueTypeDto) => TYPE[t].label;
export const priorityLabel = (p: IssuePriorityDto) => PRIORITY[p].label;
export const statusLabel = (s: IssueStatusDto) => STATUS[s].label;

export function IssueTypeIcon({ type, className }: { type: IssueTypeDto; className?: string }) {
  const { icon: Icon, color, label } = TYPE[type];
  return <Icon className={cn("h-4 w-4", color, className)} aria-label={label} />;
}

export function PriorityIcon({
  priority,
  className,
}: {
  priority: IssuePriorityDto;
  className?: string;
}) {
  const { icon: Icon, color, label } = PRIORITY[priority];
  return <Icon className={cn("h-4 w-4", color, className)} aria-label={`${label} priority`} />;
}

export function StatusBadge({ status }: { status: IssueStatusDto }) {
  const { dot, label } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

export function StatusDot({ status, className }: { status: IssueStatusDto; className?: string }) {
  return <span className={cn("h-2 w-2 rounded-full", STATUS[status].dot, className)} />;
}
