import { NextRequest, NextResponse } from "next/server";
import { BackfillService } from "@/features/code-integration/services/backfill.service";
import { callbackUrl, originOf } from "@/features/code-integration/lib/callback-url";
import { logSwallowed } from "@/shared/lib/swallowed";

// Where the git host sends the browser back (35 §4, BR-14).
//
// No session check, deliberately. This request arrives as a redirect the
// provider controls; what authorises it is the single-use `state`, consumed
// with a `DELETE … RETURNING` so a replay finds nothing. Requiring a session
// on top would break the legitimate case where the callback lands in a fresh
// tab, and would add nothing — an attacker with a stolen state and a session
// is already the account holder.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const origin = originOf(request);
  const state = query.get("state") ?? "";

  // The provider refused before we ever see a code — a declined consent screen,
  // or an app the person cancelled. Not an error on our side.
  const denied = query.get("error");
  if (denied) {
    return NextResponse.redirect(`${origin}/admin/code?connected=denied`);
  }

  try {
    const { returnTo } = await BackfillService.completeAuthorization({
      state,
      code: query.get("code") ?? undefined,
      installationId: query.get("installation_id") ?? undefined,
      redirectUri: callbackUrl(request),
    });
    return NextResponse.redirect(`${origin}${returnTo ?? "/admin/code"}?connected=1`);
  } catch (error) {
    // The failure detail can contain provider response text, so it is logged
    // and not put in a URL a browser will keep in history.
    logSwallowed("codeIntegration.authCallback", error);
    return NextResponse.redirect(`${origin}/admin/code?connected=failed`);
  }
}
