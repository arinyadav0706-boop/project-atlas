import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { toHttpStatus } from "@/shared/lib/errors";

// The single place domain errors become HTTP responses (Coding Standards
// §6) — every Route Handler wraps its body in handleRoute instead of
// duplicating try/catch translation logic.
export async function handleRoute(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "ValidationError",
          message: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 422 },
      );
    }
    const status = toHttpStatus(error);
    if (status === 500) {
      console.error(error);
      return NextResponse.json(
        { error: "InternalError", message: "Something went wrong." },
        { status },
      );
    }
    const known = error as Error;
    return NextResponse.json(
      { error: known.name, message: known.message },
      { status },
    );
  }
}
