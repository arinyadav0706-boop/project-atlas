"use client";

import { ADMIN_SECTIONS } from "@/features/admin/registry/admin-sections";
import { TabNav } from "@/shared/components/ui/tab-nav";

// Console tabs from the section registry (ADR-0022 §3), filtered to the ids the
// server said this actor may see. New admin areas appear here automatically —
// one registry entry, no edit to this component.
//
// The tab styling itself lives in `TabNav`, shared with the project shell; this
// component's job is only the registry filtering.
//
// It MUST stay a client component. The registry's `icon` entries are React
// component references, and a server component cannot hand a function to a
// client one — dropping the directive 500'd every admin route with "Functions
// cannot be passed directly to Client Components". Keeping the boundary here
// means the icons never cross it.
export function AdminConsoleNav({ allowedIds }: { allowedIds: string[] }) {
  const items = ADMIN_SECTIONS.filter((s) => allowedIds.includes(s.id))
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ href: s.href, label: s.label, icon: s.icon }));

  return <TabNav items={items} />;
}
