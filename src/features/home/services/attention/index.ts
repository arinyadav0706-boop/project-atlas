import type { AttentionContext } from "@/features/home/types/attention";
import type { AttentionItemDto } from "@/features/home/types/home.types";
import { assignedChangedSource } from "./assigned-changed.source";

// The unified attention registry (ADR-0012). Adding a source is the ONLY way a
// module contributes to "Needs your attention" — no Home widgets. Register new
// sources here (or have modules self-register) as they ship.
const SOURCES = [assignedChangedSource];

export const AttentionComposer = {
  // Runs every source in parallel, isolates failures (one bad source can't break
  // Home), merges, ranks newest-first, and bounds.
  async compose(ctx: AttentionContext): Promise<AttentionItemDto[]> {
    const results = await Promise.all(
      SOURCES.map((source) => source.collect(ctx).catch(() => [] as AttentionItemDto[])),
    );
    return results
      .flat()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, ctx.limit);
  },
};
