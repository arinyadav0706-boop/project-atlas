import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BackfillService } from "@/features/code-integration/services/backfill.service";
import { callbackUrl } from "@/features/code-integration/lib/callback-url";

// Start a provider app install (35 §4).
//
// A redirect rather than JSON, so the admin screen can be a plain link and the
// browser goes where it needs to. Errors still render as JSON — a redirect to
// a provider with a half-built URL would be a much worse way to learn that
// GITHUB_APP_ID is unset.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ connectionId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  try {
    const actor = await requireActor();
    const { url } = await BackfillService.startAuthorization(actor, params.connectionId, {
      redirectUri: callbackUrl(request),
      returnTo: request.nextUrl.searchParams.get("returnTo") ?? "/admin/code",
    });
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start authorisation.";
    // 400 rather than 500: every realistic failure here is configuration —
    // no encryption key, no registered app — and the message is the fix.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
