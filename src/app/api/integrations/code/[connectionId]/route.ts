import { NextRequest, NextResponse } from "next/server";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { logSwallowed } from "@/shared/lib/swallowed";

// The inbound endpoint (34_code_integration.md §4).
//
// Deliberately NOT wrapped in `handleRoute`: this answers a machine, not our
// UI, and its error contract is different. A git host that sees errors disables
// the hook — GitLab does this after enough failures — and then nothing works
// and nobody knows why. So the only non-200 is a secret that did not verify
// (which must be loud, or a misconfigured hook posts into the void forever) and
// a connection that does not exist.
//
// Everything else — an unmodelled event, a body that is not JSON, no issue keys,
// keys that match nothing — is a successful "nothing to do" (BR-8).

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ connectionId: string }> };

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  try {
    // The RAW body, read once. A provider that signs the payload signs these
    // exact bytes, so re-serialising a parsed object would break verification.
    const rawBody = await request.text();
    const outcome = await CodeIntegrationService.ingest({
      connectionId: params.connectionId,
      headers: request.headers,
      rawBody,
    });
    return NextResponse.json(
      { ok: outcome.ok, message: outcome.reason, linked: outcome.linked ?? 0 },
      { status: outcome.ok ? 200 : (outcome.status ?? 400) },
    );
  } catch (error) {
    // Even a bug on our side is answered 200. The alternative is GitLab
    // disabling the hook over a transient fault, which turns a five-minute
    // incident into a silent outage somebody notices next week.
    logSwallowed(`codeIntegration.ingest(${params.connectionId})`, error);
    return NextResponse.json(
      { ok: true, message: "Received; could not be processed.", linked: 0 },
      { status: 200 },
    );
  }
}
