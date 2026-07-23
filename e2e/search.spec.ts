import { test, expect, type Page } from "@playwright/test";

// Global search palette (12_search.md, ADR-0021). Kavya is LEAD of any project
// she creates. Seeded password: Passw0rd!.

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Passw0rd!");
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

test("the palette finds an issue and navigates to it", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");

  const stamp = Date.now();
  const key = ("S" + stamp.toString(36).toUpperCase()).slice(0, 10);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(`Search ${stamp}`);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: /Search/i }).first().click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  // A distinctive title so the query matches this issue and nothing else.
  const token = `zephyr${stamp.toString(36)}`;
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(`Investigate ${token} regression`);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });

  // Open the palette from the top-bar trigger and search.
  await page.getByRole("button", { name: /^Search$/ }).click();
  const input = page.getByRole("textbox", { name: /search issues and projects/i });
  await expect(input).toBeVisible();
  await input.fill(token);

  const result = page.getByRole("button", { name: new RegExp(`Investigate ${token}`, "i") });
  await expect(result).toBeVisible({ timeout: 15000 });
  await result.click();

  // Landed on the issue detail.
  await page.waitForURL(/\/projects\/.+\/issues\/.+/);
  await expect(page.getByText(new RegExp(`Investigate ${token}`, "i"))).toBeVisible();
});

test("⌘K opens the palette and Escape closes it", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/projects");

  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("textbox", { name: /search issues and projects/i });
  await expect(input).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});
