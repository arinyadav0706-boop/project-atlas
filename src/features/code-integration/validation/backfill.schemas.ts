import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).

export const setRepositoriesSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1, "Choose at least one repository."),
    enabled: z.boolean(),
  })
  .strict();

/**
 * The backfill window, in days.
 *
 * Capped at five years rather than left open: "everything" on a decade-old
 * monorepo is hours of API calls and a rate-limit ban, and the cap is the
 * difference between a bounded feature and an outage (35/BR-9).
 */
export const backfillWindowSchema = z
  .object({
    backfillDays: z
      .number()
      .int()
      .min(1, "The window has to be at least a day.")
      .max(1825, "Five years is the maximum; a longer walk will not finish."),
  })
  .strict();

export type SetRepositoriesInput = z.infer<typeof setRepositoriesSchema>;
export type BackfillWindowInput = z.infer<typeof backfillWindowSchema>;
