import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// End-to-end flows against a real browser + app + DB. Uses the seeded demo
// project "EAGLES Demo" and its seeded members:
//   Kavya Iyer  (kavya.iyer@consint.ai)  — LEAD   → can create
//   Diya Nair   (diya.nair@consint.ai)   — VIEWER → read-only
// All seeded users share the password Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

async function openDemoIssues(page: Page) {
  await page.goto("/projects");
  await page.getByRole("link", { name: /EAGLES Demo/i }).click();
  await page.waitForURL(/\/projects\/.+\/issues/);
}

test("LEAD can sign in and create an issue end-to-end", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await openDemoIssues(page);

  await page.getByRole("button", { name: /new issue/i }).first().click();
  const title = `E2E smoke ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();

  // Success toast confirms the write, then the new issue appears in the list
  // (generous timeout — next dev recompiles on router.refresh).
  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });
});

test("VIEWER sees the issues list but no create control", async ({ page }) => {
  await signIn(page, "diya.nair@consint.ai");
  await openDemoIssues(page);

  // The list/tabs render…
  await expect(page.getByRole("tab", { name: /Issues/i }).or(page.getByText(/EAGLES Demo/i))).toBeVisible();
  // …but a VIEWER gets no "New issue" button.
  await expect(page.getByRole("button", { name: /new issue/i })).toHaveCount(0);
});
