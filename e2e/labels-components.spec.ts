import { test, expect, type Page } from "@playwright/test";

// Labels & Components on the issue detail + Project Settings (ADR-0018).
// Kavya is LEAD of any project she creates. Seeded password: Passw0rd!.

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
  return page.url().match(/projects\/([^/]+)/)![1];
}

test("manage a component + label, then classify an issue (auto-assign)", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  const projectId = await createProject(page, `Classify ${Date.now()}`);

  // --- Settings: create a component with Kavya as lead, and a label. ---
  await page.goto(`/projects/${projectId}/settings`);

  const componentsCard = page.locator("section").filter({ hasText: "Components" });
  await componentsCard.getByLabel("New component name").fill("Payments");
  await componentsCard.getByRole("combobox", { name: /owner/i }).click();
  await page.getByRole("option", { name: /Kavya Iyer/i }).click();
  await componentsCard.getByRole("button", { name: /add component/i }).click();
  await expect(componentsCard.getByText("Payments")).toBeVisible({ timeout: 15000 });

  const labelsCard = page.locator("section").filter({ hasText: "Labels" });
  await labelsCard.getByLabel("New label name").fill("frontend");
  await labelsCard.getByRole("button", { name: /add label/i }).click();
  await expect(labelsCard.getByText("frontend")).toBeVisible({ timeout: 15000 });

  // --- Create an unassigned issue and open it. ---
  await page.goto(`/projects/${projectId}/issues`);
  await page.getByRole("button", { name: /new issue/i }).first().click();
  const title = `Classify me ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(/\/issues\/.+/);

  // Reporter is Kavya; assignee is empty → exactly one "Kavya Iyer" on the page.
  await expect(page.getByText("Kavya Iyer")).toHaveCount(1, { timeout: 15000 });

  // --- Apply the label via the picker. ---
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByPlaceholder(/filter or create/i).fill("front");
  await page.getByRole("menuitem", { name: /frontend/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Remove label frontend")).toBeVisible({ timeout: 15000 });

  // --- Apply the component → it auto-assigns the unassigned issue to its lead. ---
  await page.getByRole("button", { name: "Add component" }).click();
  await page.getByRole("menuitem", { name: /Payments/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Remove component Payments")).toBeVisible({ timeout: 15000 });

  // Now Kavya is both reporter and (auto-assigned) assignee → two occurrences.
  await expect(page.getByText("Kavya Iyer")).toHaveCount(2, { timeout: 15000 });

  // --- Board: the card shows the label + component chips, and the label
  // filter narrows to it. ---
  await page.goto(`/projects/${projectId}/board`);
  // The card carries the component + label chips (only this card has them).
  await expect(page.getByText("Payments").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("frontend").first()).toBeVisible();

  // The label filter control narrows the board; the labeled card stays.
  await page.getByRole("button", { name: /^Labels/ }).click();
  await page.getByRole("menuitem", { name: /^frontend$/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });
});
