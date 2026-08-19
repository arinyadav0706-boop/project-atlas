import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/27_dependencies.md §7.

/** BR-10 — beyond this the panel stops being information. */
export const MAX_LINKS_PER_ISSUE = 50;

/**
 * BR-7 — the cycle walk's ceiling.
 *
 * A bounded breadth-first search over BLOCKS edges. Real chains are a handful
 * of hops; this exists so a pathological graph refuses the link rather than
 * hanging the request.
 */
export const MAX_CYCLE_NODES = 500;

export const issueLinkType = z.enum(["BLOCKS", "RELATES_TO", "DUPLICATES"]);

export const createLinkSchema = z
  .object({
    type: issueLinkType,
    /**
     * Which way round, from the page the user is standing on. `outward` means
     * "this issue BLOCKS that one"; `inward` means "this issue IS BLOCKED BY
     * that one".
     *
     * One endpoint, both sentences: without this, "blocked by" would need its
     * own route, and the two would eventually disagree about validation.
     */
    direction: z.enum(["outward", "inward"]).default("outward"),
    /** The other issue, by id… */
    targetId: z.string().trim().min(1).optional(),
    /** …or by the key a person actually types ("VWP-42"). */
    targetKey: z.string().trim().min(1).max(30).optional(),
  })
  // Exactly one. Accepting both would mean deciding which wins, and silently
  // ignoring one of two contradictory instructions is worse than refusing.
  .refine((v) => Boolean(v.targetId) !== Boolean(v.targetKey), {
    message: "Name the other issue either by id or by key, not both.",
    path: ["targetKey"],
  });

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
