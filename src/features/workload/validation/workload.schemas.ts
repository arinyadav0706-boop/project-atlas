import { z } from "zod";

// Everything external is validated with Zod (CLAUDE.md rule 7). Ids are cuids;
// an unparsable id is rejected at the boundary rather than reaching Prisma.
export const workloadQuerySchema = z.object({
  teamId: z.string().cuid().optional(),
});

export const workloadUserParamsSchema = z.object({
  userId: z.string().cuid(),
});

export type WorkloadQuery = z.infer<typeof workloadQuerySchema>;
