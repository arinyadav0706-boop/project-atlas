import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Reports tab (11_reports.md, ADR-0020). Kavya is LEAD of any project she
// creates. Seeded password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

test("the Reports tab renders the three MVP reports", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");

  const stamp = Date.now();
  const name = `Reports ${stamp}`;
  const key = ("R" + stamp.toString(36).toUpperCase()).slice(0, 10);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(name);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: new RegExp(name, "i") }).first().click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  // Create one issue so Status breakdown has data.
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(`Report seed ${Date.now()}`);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });

  // Open the Reports tab.
  await page.getByRole("link", { name: /^Reports$/ }).click();
  await page.waitForURL(/\/reports/);

  await expect(page.getByRole("heading", { name: "Velocity" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Status breakdown" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cycle time" })).toBeVisible();
  // Status breakdown counts the issue we created.
  await expect(page.getByText("To Do")).toBeVisible();
});
