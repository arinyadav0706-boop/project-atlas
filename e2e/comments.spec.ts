import { test, expect, type Page } from "@playwright/test";

// Comments on the issue detail page. Kavya is LEAD of any project she creates.
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

// Create an issue and open its detail page.
async function openNewIssue(page: Page, title: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/issues\/.+/);
}

test("post, edit, and delete a comment; body is escaped", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Comments ${Date.now()}`);
  await openNewIssue(page, `Talk ${Date.now()}`);

  // Scope everything to the Comments section (the issue panel has its own
  // Edit/Delete controls above it).
  const comments = page.locator("section").filter({ hasText: "Comments" });
  const composer = comments.getByLabel("Add a comment");
  await expect(composer).toBeVisible({ timeout: 15000 });

  // Post.
  await composer.fill("Hello world");
  await comments.getByRole("button", { name: /^comment$/i }).click();
  await expect(comments.getByText("Hello world")).toBeVisible({ timeout: 15000 });

  // Edit.
  await comments.getByRole("button", { name: /^edit$/i }).first().click();
  await comments.getByLabel("Edit comment").fill("Hello edited");
  await comments.getByRole("button", { name: /^save$/i }).click();
  await expect(comments.getByText("Hello edited")).toBeVisible({ timeout: 15000 });
  await expect(comments.getByText(/· edited/i).first()).toBeVisible();

  // XSS boundary: a script-looking comment renders as literal text, not markup.
  await composer.fill("<script>alert(1)</script>");
  await comments.getByRole("button", { name: /^comment$/i }).click();
  await expect(comments.getByText("<script>alert(1)</script>")).toBeVisible({ timeout: 15000 });

  // Delete the first comment.
  await comments.getByRole("button", { name: /^delete$/i }).first().click();
  await expect(comments.getByText("Hello edited")).toHaveCount(0, { timeout: 15000 });
});
