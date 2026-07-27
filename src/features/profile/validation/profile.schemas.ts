import { z } from "zod";

// Self-service update input (16_profile.md BR-3, AC-3). `.strict()` + at-least-
// one means privileged fields (orgRole/isActive/email/avatarUrl) aren't part of
// the schema at all — a crafted request can't grant privilege, it 422s. The
// server never treats these as "ignored"; they're rejected.
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100, "Name is too long."),
    notificationsEnabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => v.name !== undefined || v.notificationsEnabled !== undefined, {
    message: "Nothing to update.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
