import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RateLimitError, toHttpStatus } from "@/shared/lib/errors";

// The single place domain errors become HTTP responses (Coding Standards
// §6) — every Route Handler wraps its body in handleRoute instead of
// duplicating try/catch translation logic.
//
// Every response also carries a `Server-Timing: app;dur=<ms>` header measuring
// the time spent *inside* the handler (auth + DB + business logic). Compare it
// in DevTools → Network against the request's total time: the difference is
// cold start + network. Cheap, standard, and useful to keep in production.
export async function handleRoute(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const start = performance.now();
  const withTiming = (res: NextResponse): NextResponse => {
    res.headers.set(
      "Server-Timing",
      `app;dur=${(performance.now() - start).toFixed(1)};desc="server compute"`,
    );
    return res;
  };

  try {
    return withTiming(await fn());
  } catch (error) {
    if (error instanceof ZodError) {
      return withTiming(
        NextResponse.json(
          {
            error: "ValidationError",
            message: error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          },
          { status: 422 },
        ),
      );
    }
    const status = toHttpStatus(error);
    if (status === 500) {
      console.error(error);
      return withTiming(
        NextResponse.json(
          { error: "InternalError", message: "Something went wrong." },
          { status },
        ),
      );
    }
    const known = error as Error;
    const response = NextResponse.json(
      { error: known.name, message: known.message },
      { status },
    );
    if (error instanceof RateLimitError) {
      response.headers.set("Retry-After", String(error.retryAfterSec));
    }
    return withTiming(response);
  }
}
