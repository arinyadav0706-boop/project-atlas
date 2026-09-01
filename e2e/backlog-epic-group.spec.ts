import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Backlog "Group by epic" view (ADR-0026): toggling the view splits the backlog
// into a collapsible section per epic + a trailing "No epic" section; a child
// sits under its parent, an unparented issue under "No epic", and a section
// collapses/expands. Kavya is LEAD of any project she creates. Password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

async function createIssue(page: Page, title: string, type: "Epic" | "Story", epicTitle?: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.locator("#issue-type").click();
  await page.getByRole("option", { name: type, exact: true }).click();
  if (epicTitle) {
    await page.getByRole("button", { name: /no epic/i }).click();
    await page.getByRole("textbox", { name: /search epics/i }).fill(epicTitle);
    await page.getByRole("button", { name: new RegExp(epicTitle, "i") }).click();
  }
  await page.getByRole("button", { name: /create issue/i }).click();
  // The dialog closing (Title field detached) is a reliable per-create signal —
  // success toasts stack across consecutive creates and aren't uniquely matchable.
  await expect(page.getByLabel("Title")).toHaveCount(0, { timeout: 15000 });
}

test("group the backlog by epic: child under its parent, orphan under No epic, collapse", async ({
  page,
}) => {
  await signIn(page, "kavya.iyer@consint.ai");

  const stamp = Date.now().toString(36);
  const key = ("G" + stamp.toUpperCase()).slice(0, 8);
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  await page.locator("#new-project-key").fill(key);
  await page.locator("#new-project-name").fill(`Grouping ${stamp}`);
  await page.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name: /Grouping/i }).first().click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  const epicTitle = `Checkout epic ${stamp}`;
  const childTitle = `Pay button ${stamp}`;
  const orphanTitle = `Loose task ${stamp}`;
  await createIssue(page, epicTitle, "Epic");
  await createIssue(page, childTitle, "Story", epicTitle);
  await createIssue(page, orphanTitle, "Story");

  // Go to the backlog — all three land here (unscheduled, BR-2).
  await page.getByRole("link", { name: /backlog/i }).first().click();
  await page.waitForURL(/\/projects\/.+\/backlog/);
  await expect(page.getByRole("link", { name: childTitle })).toBeVisible({ timeout: 15000 });

  // The group headers are the collapsible buttons that carry aria-expanded AND
  // the group's title text (the epic row and the group-by Select also carry
  // aria-expanded / the title, so both filters are needed to disambiguate).
  const epicGroup = page.locator("button[aria-expanded]").filter({ hasText: epicTitle });
  const noEpicGroup = page.locator("button[aria-expanded]").filter({ hasText: "No epic" });

  // Flat view: no epic group header yet.
  await expect(noEpicGroup).toHaveCount(0);

  // Switch "Group by" → Epic.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Epic", exact: true }).click();
  await expect(epicGroup).toBeVisible({ timeout: 15000 });
  await expect(noEpicGroup).toBeVisible();

  // Child sits under its parent epic; the orphan under "No epic".
  await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: orphanTitle })).toBeVisible();

  // Collapse the epic group → its child is hidden; expand → it returns.
  await expect(epicGroup).toHaveAttribute("aria-expanded", "true");
  await epicGroup.click();
  await expect(epicGroup).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: childTitle })).toHaveCount(0);
  // The orphan (in the still-open "No epic" group) is unaffected.
  await expect(page.getByRole("link", { name: orphanTitle })).toBeVisible();

  await epicGroup.click();
  await expect(page.getByRole("link", { name: childTitle })).toBeVisible();
});
