import { test, expect, type Page } from "@playwright/test";

// Notifications end-to-end (10_notifications.md, ADR-0019). Two browser
// contexts: Kavya (LEAD) assigns an issue to Aditi; Aditi sees the bell light
// up, opens it, and clicking the notification navigates to the issue.
// Seeded users share the password Passw0rd!.

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Passw0rd!");
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

test("assigning an issue notifies the assignee via the bell", async ({ browser }) => {
  const stamp = Date.now();
  // --- Kavya sets everything up. ---
  const kavyaCtx = await browser.newContext();
  const kavya = await kavyaCtx.newPage();
  await signIn(kavya, "kavya.iyer@consint.ai");

  const key = ("N" + stamp.toString(36).toUpperCase()).slice(0, 10);
  await kavya.goto("/projects");
  await kavya.getByRole("button", { name: /new project/i }).click();
  await kavya.locator("#new-project-key").fill(key);
  await kavya.locator("#new-project-name").fill(`Notify ${stamp}`);
  await kavya.getByRole("button", { name: /create project/i }).click();
  await kavya.getByRole("link", { name: new RegExp(`Notify ${stamp}`, "i") }).click();
  await kavya.waitForURL(/\/projects\/.+\/issues/);
  const projectId = kavya.url().match(/projects\/([^/]+)/)![1];

  // Add Aditi as a project member (she's a seeded user).
  await kavya.goto(`/projects/${projectId}/settings`);
  await kavya.getByRole("button", { name: /add member/i }).click();
  await kavya.locator("#member-email").fill("aditi.sharma@consint.ai");
  await kavya.getByRole("dialog").getByRole("button", { name: /add member/i }).click();
  await expect(kavya.getByText(/member added/i)).toBeVisible({ timeout: 15000 });

  // Create an issue and assign it to Aditi via Edit.
  await kavya.goto(`/projects/${projectId}/issues`);
  const title = `Assign to Aditi ${stamp}`;
  await kavya.getByRole("button", { name: /new issue/i }).first().click();
  await kavya.getByLabel("Title").fill(title);
  await kavya.getByRole("button", { name: /create issue/i }).click();
  await expect(kavya.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
  await kavya.getByRole("link", { name: title }).click();
  await kavya.waitForURL(/\/issues\/.+/);

  await kavya.getByRole("button", { name: /edit issue/i }).click();
  await kavya.locator("#edit-assignee").click();
  await kavya.getByRole("option", { name: /Aditi Sharma/i }).click();
  await kavya.getByRole("dialog").getByRole("button", { name: /save changes/i }).click();
  await expect(kavya.getByRole("dialog")).toHaveCount(0, { timeout: 15000 });

  // --- Aditi sees the notification. ---
  const aditiCtx = await browser.newContext();
  const aditi = await aditiCtx.newPage();
  await signIn(aditi, "aditi.sharma@consint.ai");
  await aditi.goto("/home");

  // Bell shows an unread badge.
  const bell = aditi.getByRole("button", { name: /notifications \(\d+ unread\)/i });
  await expect(bell).toBeVisible({ timeout: 15000 });

  // Open it and click the assignment notification → navigates to the issue.
  await bell.click();
  await expect(aditi.getByText(new RegExp(`You were assigned .*${title.slice(0, 12)}`, "i")))
    .toBeVisible({ timeout: 15000 });
  await aditi.getByText(/You were assigned/i).first().click();
  await aditi.waitForURL(/\/issues\/.+/, { timeout: 15000 });

  await kavyaCtx.close();
  await aditiCtx.close();
});
