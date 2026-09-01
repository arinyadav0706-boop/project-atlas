import type { NextRequest } from "next/server";

// The one definition of the OAuth redirect URI (ADR-0054 §2).
//
// It has to be byte-identical in two places — the authorize request and the
// token exchange — because both providers compare them and reject a mismatch
// with a message that names neither value. Deriving it twice from two slightly
// different code paths is the classic way to spend an afternoon on
// `redirect_uri_mismatch`, so it is derived once, here.
//
// Built from the request's own origin rather than a configured base URL, for
// the same reason the webhook URL on the admin screen is: whatever host the
// admin reached us on is the host the provider must redirect back to.

export const CALLBACK_PATH = "/api/integrations/code/callback";

export function originOf(request: NextRequest): string {
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? request.nextUrl.host;
  const protocol =
    headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "") ?? "http";
  return `${protocol}://${host}`;
}

export function callbackUrl(request: NextRequest): string {
  return `${originOf(request)}${CALLBACK_PATH}`;
}
