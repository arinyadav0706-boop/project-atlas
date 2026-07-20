import { z } from "zod";
import { issuePriority, issueType } from "@/features/issues/validation/issue.schemas";

// Parses the BoardFilter from query params (ADR-0008). Empty/omitted fields
// drop out so the filter object only carries active constraints. `labelIds`
// arrives as repeated `?labelIds=` params (read via searchParams.getAll).
export const boardFilterSchema = z.object({
  sprintId: z.string().trim().min(1).optional(),
  epicId: z.string().trim().min(1).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  type: issueType.optional(),
  priority: issuePriority.optional(),
  labelIds: z.array(z.string().trim().min(1)).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type BoardFilterInput = z.infer<typeof boardFilterSchema>;
