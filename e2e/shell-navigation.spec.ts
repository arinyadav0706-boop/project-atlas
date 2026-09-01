import { test, expect, type Page } from "@playwright/test";
import { DEMO_USERS, signInAs } from "./support/session";

// Gap 2 and 4 from the Phase 0 rescope (05_Dependency_Review.md §4).
//
// This is the spec the UI modernization exists for. A shell change — new
// frame, new padding, a workspace that owns its own height — is exactly the
// kind of edit that breaks a route without breaking a unit test, because
// nothing in the unit or integration suites renders a page.
//
// It deliberately asserts on ROLES and TEXT, never on class names or layout
// values, so it stays true through a visual redesign and fails only when
// something is actually broken.

async function signIn(page: Page, email: string) {
  await signInAs(page, email);
}

/** Every destination reachable from the global rail, for an org admin. */
const ROUTES = [
  { path: "/home", heading: /good (morning|afternoon|evening)/i },
  { path: "/projects", heading: /projects/i },
  { path: "/issues", heading: /issues/i },
  { path: "/dashboards", heading: /dashboards/i },
  { path: "/workload", heading: /workload/i },
  { path: "/notifications", heading: /notifications/i },
  { path: "/profile", heading: /profile/i },
  { path: "/admin", heading: /admin/i },
] as const;

test("every top-level route renders its own page, signed in as an admin", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);

  for (const route of ROUTES) {
    await page.goto(route.path);
    // Landing back on sign-in is the failure a shell change causes and a unit
    // test cannot see.
    await expect(page, `${route.path} should not bounce to sign-in`).not.toHaveURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { name: route.heading }).first(),
      `${route.path} should render its heading`,
    ).toBeVisible({ timeout: 15000 });
    // The shell itself must survive: the global rail is what makes this an
    // application rather than a set of pages.
    await expect(page.getByRole("link", { name: /^projects$/i }).first()).toBeVisible();
  }
});

test("the sidebar navigates, and browser back and forward both work", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);

  await page.getByRole("link", { name: /^projects$/i }).first().click();
  await page.waitForURL(/\/projects/);

  await page.getByRole("link", { name: /^issues$/i }).first().click();
  await page.waitForURL(/\/issues/);

  // Back and forward are the two things client-side routing quietly breaks.
  await page.goBack();
  await expect(page).toHaveURL(/\/projects/);
  await page.goForward();
  await expect(page).toHaveURL(/\/issues/);
  await expect(page.getByRole("heading", { name: /issues/i }).first()).toBeVisible();
});

test("a deep link into a filtered issue list opens already filtered", async ({ page }) => {
  // Gap 3. The filter is parsed server-side from `searchParams`; a layout
  // change must not disturb the round trip, and a shared link must not flash
  // the unfiltered list first.
  await signIn(page, DEMO_USERS.admin);
  await page.goto("/issues?type=BUG");

  await expect(page).toHaveURL(/type=BUG/);
  await expect(page.getByRole("heading", { name: /issues/i }).first()).toBeVisible();
  // The control reflects the URL rather than defaulting — the actual regression
  // risk, since the page could render correctly and silently ignore the param.
  await expect(page.getByText(/^bug$/i).first()).toBeVisible({ timeout: 15000 });
});

test("a signed-out deep link redirects to sign-in", async ({ page }) => {
  // No session restored on purpose.
  await page.goto("/issues");
  await expect(page).toHaveURL(/\/sign-in/);
});
