import { z } from "zod";
import { CODE_PROVIDERS } from "@/features/code-integration/lib/provider";

// One schema per action, shared client/server (Coding Standards §3).

export const createConnectionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the connection a name.")
      .max(60, "Keep the name under 60 characters."),
    provider: z.enum(CODE_PROVIDERS).default("GITLAB"),
    /** Self-managed GitLab is the common case, so the host is asked for. */
    baseUrl: z.string().trim().url("That is not a valid URL."),
  })
  .strict();

export const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    baseUrl: z.string().trim().url().optional(),
    active: z.boolean().optional(),
    /** Null switches the on-merge transition off again. */
    onMergeStatusId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
