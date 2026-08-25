import { NextRequest } from "next/server";
import { v1Route, page, pageSize } from "@/features/public-api/lib/v1";
import { ProjectService } from "@/features/projects/services/project.service";
import { toPublicProject } from "@/features/public-api/services/public-mapper";

// The projects this token's owner can see — the same set the UI shows them
// (BR-2), never the whole organization.

export async function GET(request: NextRequest) {
  return v1Route(request, "projects:read", async ({ actor, query }) => {
    const projects = await ProjectService.list(actor);
    const take = pageSize(query);
    const cursor = query.get("cursor")?.trim();
    // The project list is small and already fully resolved per caller, so it
    // is paged in memory rather than re-queried. Same envelope as every other
    // list, so a client cannot tell — and if it ever grows, the contract does
    // not change.
    const start = cursor ? projects.findIndex((p) => p.id === cursor) + 1 : 0;
    const slice = projects.slice(start, start + take + 1);
    return page(slice.map(toPublicProject), take, (p) => p.id);
  });
}
