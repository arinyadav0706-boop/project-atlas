import type {
  IssuePriorityDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type {
  RecurrenceFrequencyDto,
  RecurrenceModeDto,
} from "@/features/recurrence/lib/schedule";

// DTOs for recurring issues (ADR-0051, docs/02_Modules/32_recurring.md).

export type { RecurrenceFrequencyDto, RecurrenceModeDto };

export interface RecurrenceDto {
  id: string;
  name: string;
  active: boolean;
  mode: RecurrenceModeDto;
  frequency: RecurrenceFrequencyDto;
  interval: number;
  /** ISO date — every interval is counted from here (BR-15). */
  startsOn: string;
  weekdays: number[];
  dayOfMonth: number | null;
  timeOfDay: number;
  timeZone: string;
  skipWeekends: boolean;
  skipIfOpen: boolean;
  intervalDays: number | null;

  // The template stamped out each time.
  title: string;
  description: string | null;
  type: IssueTypeDto;
  priority: IssuePriorityDto;
  assignee: { id: string; name: string } | null;
  reporter: { id: string; name: string };
  dueInDays: number | null;

  // State.
  nextRunAt: string | null;
  lastRunAt: string | null;
  occurrences: number;
  endsOn: string | null;
  maxOccurrences: number | null;
  /** Why the last firing failed, if it did (BR-13). */
  lastError: string | null;

  /** The schedule as a sentence, resolved server-side so every surface agrees. */
  summary: string;
  /** The most recent issues this produced — the record, in place of a log (§9). */
  recentIssues: { id: string; key: string; title: string; createdAt: string }[];
}

export interface RecurrencesDto {
  items: RecurrenceDto[];
  /** Whether the viewer may create or edit — LEAD or org ADMIN (BR-12). */
  canManage: boolean;
}

/** What one scheduler tick did. Returned to whatever cron called it. */
export interface SchedulerTickDto {
  /** How many recurrences were due and claimed. */
  claimed: number;
  created: number;
  skipped: number;
  failed: number;
  /** One line each, for the caller's own logs. */
  details: string[];
}
