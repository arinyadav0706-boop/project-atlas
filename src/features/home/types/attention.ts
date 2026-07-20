import type { Actor } from "@/shared/types/actor";
import type { AttentionItemDto } from "./home.types";

// The extension point of the unified attention model (ADR-0012). Every module
// that needs to put something in front of a user contributes an AttentionSource
// instead of adding a Home widget. The Home service composes all registered
// sources in parallel, merges, ranks, and bounds — knowing nothing about them.
export interface AttentionContext {
  actor: Actor;
  // Projects the caller may see — sources MUST scope to these (BR-7).
  memberProjectIds: string[];
  // Per-source cap the composer applies before merging.
  limit: number;
}

export interface AttentionSource {
  readonly key: string;
  collect(ctx: AttentionContext): Promise<AttentionItemDto[]>;
}
