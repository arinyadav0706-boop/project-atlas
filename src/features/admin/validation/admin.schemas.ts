import { z } from "zod";

// Org settings (13_admin.md Validation). `domain` is informational config
// (BR-4) — validated for shape, but editing it never flips sign-in restriction.
export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z
    .string()
    .trim()
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain, e.g. example.com")
    .optional()
    .or(z.literal("")),
  // Working week (ADR-0034 amendment) — the basis of every capacity figure.
  // Bounded so a typo can't make the whole workload page meaningless.
  workingHoursPerDay: z.coerce
    .number()
    .min(1, "At least 1 hour")
    .max(24, "A day has 24 hours")
    .optional(),
  workingDaysPerWeek: z.coerce
    .number()
    .int()
    .min(1, "At least 1 day")
    .max(7, "A week has 7 days")
    .optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// Set an override (`enabled`) or clear it (`reset: true`) — exactly one.
export const setFeatureFlagSchema = z
  .object({
    enabled: z.boolean().optional(),
    reset: z.boolean().optional(),
  })
  .refine((v) => v.reset === true || typeof v.enabled === "boolean", {
    message: "Provide `enabled` to set an override, or `reset: true` to clear it.",
  });
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagSchema>;

// Audit-log query (13_admin.md Validation). Coerces string query params;
// pageSize is bounded so the viewer can never ask for everything at once.
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
