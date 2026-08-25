import { NextRequest } from "next/server";
import { z } from "zod";
import { v1Route, created, pageOf, pageSize, cursorOf } from "@/features/public-api/lib/v1";
import { IssueService } from "@/features/issues/services/issue.service";
import { createIssueSchema } from "@/features/issues/validation/issue.schemas";
import { toPublicIssue } from "@/features/public-api/services/public-mapper";

// A project's issues. Reads are keyset-paginated (BR-5); writes go through the
// SAME service the UI calls (BR-13), so required custom fields, assignee
// validation, the key counter and the assignment notification all still apply.

type Params = { params: Promise<{ projectId: string }> };

const listQuery = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
  type: z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]).optional(),
  assigneeId: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:read", async ({ actor, query }) => {
    // Blank params read as absent — a cleared filter is not a filter on "".
    // The same trap the internal filter parser fell into (FILT-2).
    const filters = listQuery.parse({
      ...(query.get("status")?.trim() ? { status: query.get("status")!.trim() } : {}),
      ...(query.get("type")?.trim() ? { type: query.get("type")!.trim() } : {}),
      ...(query.get("assigneeId")?.trim()
        ? { assigneeId: query.get("assigneeId")!.trim() }
        : {}),
    });
    const take = pageSize(query);
    const result = await IssueService.list(actor, params.projectId, {
      ...filters,
      cursor: cursorOf(query),
      take,
    });
    return pageOf(result.items.map(toPublicIssue), result.nextCursor);
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:write", async ({ actor }) => {
    const input = createIssueSchema.parse(await request.json());
    const issue = await IssueService.create(actor, params.projectId, input);
    return created(toPublicIssue(issue));
  });
}
