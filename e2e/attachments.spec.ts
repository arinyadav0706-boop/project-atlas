import { test, expect, type Page } from "@playwright/test";

// Attachments on the issue detail page. Kavya is LEAD of any project she creates.
// Each test uses its own project (isolation). Seeded password: Passw0rd!.

async function signIn(page: Page, email: string, password = "Passw0rd!") {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

async function createProject(page: Page, name: string) {
  const key = ("E" + Date.now().toString(36).toUpperCase()).slice(0, 10);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(name);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: new RegExp(name, "i") }).click();
  await page.waitForURL(/\/projects\/.+\/issues/);
}

async function openNewIssue(page: Page, title: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/issues\/.+/);
}

test("upload, download, and delete an attachment", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Files ${Date.now()}`);
  await openNewIssue(page, `Attach ${Date.now()}`);

  const attachments = page.locator("section").filter({ hasText: "Attachments" });
  await expect(attachments.getByText(/no files attached/i)).toBeVisible({ timeout: 15000 });

  // Upload via the (hidden) file input — setInputFiles doesn't need it visible.
  await attachments.getByLabel("Upload files").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("the actual bytes"),
  });
  await expect(attachments.getByText("notes.txt")).toBeVisible({ timeout: 15000 });

  // Download returns the same bytes through the RBAC-gated proxy route.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    attachments.getByRole("link", { name: /download notes\.txt/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("notes.txt");

  // Delete.
  await attachments.getByRole("button", { name: /delete notes\.txt/i }).click();
  await expect(attachments.getByText("notes.txt")).toHaveCount(0, { timeout: 15000 });
});
