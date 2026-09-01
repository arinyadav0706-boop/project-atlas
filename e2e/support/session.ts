import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";

// Signing in, once per user, for the whole E2E suite.
//
// This exists because of a measured failure, not a preference. Every spec used
// to POST credentials in every test, and credential login is rate-limited to
// 8 attempts per 15 minutes per IP+email (ADR-0028, `RateLimitRules.authAttempt`).
// A full run made 16 attempts as `kavya.iyer` from 127.0.0.1 inside one window,
// so the ninth onwards were refused and **eleven tests failed with
// `error=CredentialsSignin`** — the limiter working exactly as designed against
// a harness that looked like a password-spraying attack.
//
// The fix is the harness, not the limiter. Weakening a brute-force control to
// make tests pass would trade a real security property for a green tick.
//
// So: `auth.setup.ts` signs in each demo user ONCE (five attempts, well inside
// the window) and saves the session. Every test then restores cookies. Faster
// too — a full run was 12.6 minutes, most of it sign-in round-trips.

export const DEMO_PASSWORD = "Passw0rd!";

/** Written by the setup project, read by every spec. Git-ignored. */
const AUTH_DIR = path.join(process.cwd(), "e2e/.auth");

/** The demo team the specs use. Seeded by `npm run prisma:seed`. */
export const DEMO_USERS = {
  admin: "aditi.sharma@consint.ai",
  lead: "kavya.iyer@consint.ai",
  member: "ananya.reddy@consint.ai",
  viewer: "diya.nair@consint.ai",
  outsider: "meera.joshi@consint.ai",
} as const;

export function sessionFile(email: string): string {
  return path.join(AUTH_DIR, `${email.replace(/[^a-z0-9]/gi, "_")}.json`);
}

/**
 * The ONE place credentials are actually posted.
 *
 * If a second one appears, the rate limiter will find it — which is a
 * reasonable way to be told.
 */
export async function authenticate(
  browser: Browser,
  email: string,
  password = DEMO_PASSWORD,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();

  // A refused sign-in redirects back with ?error=, which would otherwise be
  // saved as an empty session and fail later in a much less obvious place.
  await page.waitForURL(/\/(home|dashboard|projects)/, { timeout: 30000 });

  mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: sessionFile(email) });
  await context.close();
}

/**
 * Restore a saved session. Drop-in replacement for the old per-spec `signIn`.
 *
 * Deliberately keeps the same `(page, email)` signature so each spec's helper
 * becomes a one-line delegation rather than a restructure.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const file = sessionFile(email);
  if (!existsSync(file)) {
    throw new Error(
      `No saved session for ${email}. The "setup" project should have created ` +
        `${file}. Run the whole suite (npx playwright test) rather than a single ` +
        `spec, or run: npx playwright test --project=setup`,
    );
  }
  // `storageState` writes exactly the shape `addCookies` accepts, so the type
  // is taken from the method rather than re-declared and kept in step by hand.
  type Cookies = Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
  const state = JSON.parse(readFileSync(file, "utf8")) as { cookies: Cookies };
  await page.context().addCookies(state.cookies);
  await page.goto("/home");
  await page.waitForURL(/\/(home|dashboard|projects)/, { timeout: 30000 });
}
