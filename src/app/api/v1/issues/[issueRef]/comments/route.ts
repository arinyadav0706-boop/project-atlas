import { NextRequest } from "next/server";
import { v1Route, created, pageOf, pageSize, cursorOf } from "@/features/public-api/lib/v1";
import { CommentService } from "@/features/comments/services/comment.service";
import { createCommentSchema } from "@/features/comments/validation/comment.schemas";
import { toPublicComment } from "@/features/public-api/services/public-mapper";
import { resolveIssueId } from "@/app/api/v1/_resolve";

// Comments on an issue. Reading needs `issues:read`; posting needs
// `comments:write` — split because "let this script read our tickets" and "let
// this script talk to our customers" are different decisions.

type Params = { params: Promise<{ issueRef: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:read", async ({ actor, query }) => {
    const id = await resolveIssueId(actor, params.issueRef);
    const take = pageSize(query);
    const result = await CommentService.list(actor, id, { cursor: cursorOf(query), take });
    return pageOf(result.items.map(toPublicComment), result.nextCursor);
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "comments:write", async ({ actor }) => {
    const id = await resolveIssueId(actor, params.issueRef);
    const input = createCommentSchema.parse(await request.json());
    return created(toPublicComment(await CommentService.create(actor, id, input)));
  });
}
