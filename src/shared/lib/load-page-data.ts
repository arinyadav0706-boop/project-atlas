import { notFound } from "next/navigation";
import { NotFoundError } from "@/shared/lib/errors";

/**
 * Run a Server Component's data load, translating a service `NotFoundError`
 * into Next's `notFound()`.
 *
 * Every page did this inline with its own try/catch — and wrapped the JSX
 * return inside it, which does not do what it looks like it does. React renders
 * the returned element *after* the page function has finished, so a `catch`
 * around the JSX never sees a render error; it only ever caught the awaits. The
 * seven copies were identical, misleading in the same way, and are now one
 * function whose scope is exactly the part that can actually throw.
 *
 * Anything that is not a `NotFoundError` is rethrown untouched, so a genuine
 * failure still reaches the error boundary instead of being flattened into a
 * 404 — which would hide an outage behind a "not found" page.
 */
export async function loadPageData<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
