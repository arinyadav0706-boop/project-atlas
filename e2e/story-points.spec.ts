import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Story points can be set on create and shown on the issue detail (unblocks
// Velocity). Kavya is LEAD of any project she creates. Password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

test("story points can be set on create and appear on the issue", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");

  const key = ("P" + Date.now().toString(36).toUpperCase()).slice(0, 10);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(`Points ${Date.now()}`);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: new RegExp(`Points`, "i") }).first().click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  const title = `Estimate me ${Date.now()}`;
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel(/story points/i).fill("5");
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/issues\/.+/);

  // The detail now shows the Story points field with the value.
  await expect(page.getByText("Story points")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("5", { exact: true })).toBeVisible();
});
