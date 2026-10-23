import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { cn } from "@/shared/lib/utils";
import type { Actor } from "@/shared/types/actor";
import type { UpcomingItemDto } from "@/features/home/types/home.types";

const KIND_LABEL: Record<UpcomingItemDto["kind"], string> = {
  DUE: "Due",
  SPRINT_START: "Sprint starts",
  SPRINT_END: "Sprint ends",
};

// The rail's coloured edge says what kind of date it is at a glance; the label
// says it in words, so colour is never the only signal.
const KIND_EDGE: Record<UpcomingItemDto["kind"], string> = {
  DUE: "bg-warning",
  SPRINT_START: "bg-accent",
  SPRINT_END: "bg-success",
};

// Upcoming (BR-16): my due dates and sprint boundaries, the next two weeks. No
// meetings — there is no calendar source, and Home does not show what it
// cannot back (BR-12).
export async function UpcomingSection({
  actor,
  projectIds,
}: {
  actor: Actor;
  projectIds: string[];
}) {
  const items = await HomeService.upcoming(actor, projectIds);
  return (
    <HomeSection title="Upcoming" icon={<CalendarRange />}>
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="grid grid-cols-[3.25rem_3px_minmax(0,1fr)] gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="text-meta leading-tight">
                  {/* A due date is a day, not an instant: label it in UTC, the
                      same calendar the timeline and due chips use. */}
                  <span className="block font-semibold text-foreground">
                    {new Date(item.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span className="block text-muted-foreground">
                    {new Date(item.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                </span>
                <span className={cn("rounded-full", KIND_EDGE[item.kind])} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-body text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-meta text-muted-foreground">
                    {KIND_LABEL[item.kind]} · {item.context}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <HomeEmpty icon={<CalendarRange />} title="Nothing in the next two weeks">
          Your due dates and sprint starts and ends will appear here.
        </HomeEmpty>
      )}
    </HomeSection>
  );
}
