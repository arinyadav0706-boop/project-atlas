import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Epic hierarchy UX (ADR-0026): create an Epic, associate a Story via the
// searchable selector, and see the hierarchy on both detail views. Kavya is
// LEAD of any project she creates. Password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

async function createIssue(page: Page, title: string, type: "Epic" | "Story", epicTitle?: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  // Type select (radix).
  await page.locator("#issue-type").click();
  await page.getByRole("option", { name: type, exact: true }).click();
  if (epicTitle) {
    // The searchable Epic selector appears for non-epic types.
    await page.getByRole("button", { name: /no epic/i }).click();
    await page.getByRole("textbox", { name: /search epics/i }).fill(epicTitle);
    await page.getByRole("button", { name: new RegExp(epicTitle, "i") }).click();
  }
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
}

test("create an epic, link a story to it, and see the hierarchy both ways", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");

  const stamp = Date.now().toString(36);
  const key = ("H" + stamp.toUpperCase()).slice(0, 8);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(`Hierarchy ${stamp}`);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: /Hierarchy/i }).first().click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  const epicTitle = `Platform epic ${stamp}`;
  const storyTitle = `Login story ${stamp}`;
  await createIssue(page, epicTitle, "Epic");
  await createIssue(page, storyTitle, "Story", epicTitle);

  // Open the story → it shows its parent epic.
  await page.getByRole("link", { name: storyTitle }).click();
  await page.waitForURL(/\/issues\/.+/);
  await expect(page.getByText("Parent epic")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: new RegExp(epicTitle, "i") })).toBeVisible();

  // Navigate to the epic via that link → it lists the story as a child.
  await page.getByRole("link", { name: new RegExp(epicTitle, "i") }).click();
  await page.waitForURL(/\/issues\/.+/);
  await expect(page.getByText("Child issues")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: new RegExp(storyTitle, "i") })).toBeVisible();
});
