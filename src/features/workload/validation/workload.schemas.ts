import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Ids are opaque bounded strings — NOT `.cuid()`. Validating the id *format*
// buys no security here (the real guard is the org-scoped lookup that 404s in
// WorkloadService) and it breaks every id we did not mint ourselves: seeded
// demo data, and anything imported during a client migration.
const id = z.string().min(1).max(64);

export const workloadQuerySchema = z.object({
  teamId: id.optional(),
});

export const workloadUserParamsSchema = z.object({
  userId: id,
});

export type WorkloadQuery = z.infer<typeof workloadQuerySchema>;
