import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { RecurrenceService } from "@/features/recurrence/services/recurrence.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { BackfillService } from "@/features/code-integration/services/backfill.service";
import { schedulerSecret } from "@/shared/lib/env";
import { UnauthorizedError } from "@/shared/lib/errors";

// The scheduler tick (ADR-0051 §5).
//
// Deliberately a plain HTTP endpoint rather than a platform primitive: Vercel
// Cron, a Kubernetes CronJob, a systemd timer and a GitHub Actions schedule can
// all call a URL, so nothing here is a bet on the current host (ADR-0004).
//
// No session — there is no user. A shared secret instead, and while that secret
// is unset every request is refused: an unauthenticated scheduler endpoint is
// an unauthenticated issue factory.
//
// Idempotent by construction: both drains claim each row with a conditional
// update before acting, so two overlapping ticks share the work rather than
// duplicating it, and a retry after a timeout is safe.
//
// Three jobs, one endpoint (ADR-0052 §8, ADR-0054 §6): recurring issues that
// are due, webhook deliveries waiting to be retried, and code backfill slices.
// A second cron for the second job would be a second thing to configure and
// forget — and by the third, certain to be forgotten.

/** Never cached, never prerendered — it has to observe the clock. */
export const dynamic = "force-dynamic";

function assertScheduler(request: NextRequest): void {
  const expected = schedulerSecret();
  if (!expected) {
    throw new UnauthorizedError("The scheduler is not configured on this deployment.");
  }
  const offered = request.headers.get("authorization") ?? "";
  const token = offered.startsWith("Bearer ") ? offered.slice(7) : "";
  // Length-first comparison, then a constant-time-ish scan: the secret is
  // long-lived and guessing it would let anyone fill a project with issues.
  if (token.length !== expected.length) {
    throw new UnauthorizedError("Not authorised to run the scheduler.");
  }
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    throw new UnauthorizedError("Not authorised to run the scheduler.");
  }
}

/** Every drain. Independent, so one failing does not starve the others. */
async function runTick() {
  const [recurrences, webhooks, backfill] = await Promise.allSettled([
    RecurrenceService.runDue(),
    WebhookService.runDue(),
    // Module 35. Deliberately the same endpoint again rather than a third cron:
    // one thing to configure is one thing to forget.
    BackfillService.runDue(),
  ]);
  return {
    recurrences:
      recurrences.status === "fulfilled"
        ? recurrences.value
        : { error: String(recurrences.reason) },
    webhooks:
      webhooks.status === "fulfilled" ? webhooks.value : { error: String(webhooks.reason) },
    backfill:
      backfill.status === "fulfilled" ? backfill.value : { error: String(backfill.reason) },
  };
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertScheduler(request);
    return NextResponse.json(await runTick());
  });
}

/**
 * The same thing, for schedulers that only issue GET.
 *
 * Vercel Cron is one, and it is the primary deployment target — it sends a GET
 * and adds `Authorization: Bearer $CRON_SECRET` itself. A POST-only endpoint
 * would be uncallable there, which is a portability claim that quietly is not
 * true. The operation is idempotent (BR-5), so it does not need to be a POST
 * for safety; POST stays as the honest verb for a caller that has a choice.
 */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    assertScheduler(request);
    return NextResponse.json(await runTick());
  });
}
