import { z } from "zod";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/features/public-api/types/public-api.types";

// One schema per action, shared client/server (Coding Standards §3).

export const createTokenSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the token a name.")
      .max(60, "Keep the name under 60 characters."),
    scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope."),
    /** Null means it never expires — allowed, but the UI nudges away from it. */
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict();

export const createWebhookSchema = z
  .object({
    url: z.string().trim().url("That is not a valid URL."),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event."),
  })
  .strict();

export const updateWebhookSchema = z
  .object({
    url: z.string().trim().url().optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
