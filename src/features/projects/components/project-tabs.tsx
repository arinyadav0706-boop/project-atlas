"use client";

import { Columns3, KanbanSquare, LineChart, ListTodo, Settings } from "lucide-react";
import { TabNav } from "@/shared/components/ui/tab-nav";

// Project-scoped sub-navigation, on the shared `TabNav` so it is the same
// control as the admin console's — same underline, weight and rhythm.
//
// Icons added to match: the admin tabs already had them, these did not, and two
// tab strips in the same screen position looking different is exactly the
// inconsistency this pass exists to remove.
//
// Client component for the same reason as AdminConsoleNav: the icons are
// component references, and the project layout that renders this is a server
// component. Passing them across that boundary throws.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}`;
  return (
    <TabNav
      items={[
        { href: `${base}/issues`, label: "Issues", icon: ListTodo },
        { href: `${base}/board`, label: "Board", icon: KanbanSquare },
        { href: `${base}/backlog`, label: "Backlog", icon: Columns3 },
        { href: `${base}/reports`, label: "Reports", icon: LineChart },
        { href: `${base}/settings`, label: "Settings", icon: Settings },
      ]}
    />
  );
}
