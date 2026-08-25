import { NextRequest } from "next/server";
import { v1Route } from "@/features/public-api/lib/v1";
import { ProjectService } from "@/features/projects/services/project.service";
import { toPublicProject } from "@/features/public-api/services/public-mapper";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "projects:read", async ({ actor }) =>
    toPublicProject(await ProjectService.get(actor, params.projectId)),
  );
}
