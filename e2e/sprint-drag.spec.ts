import { test, expect, type Page } from "@playwright/test";

// Sprint UI flows against a real browser. Kavya is an org member who becomes
// LEAD of any project she creates. All seeded users share the password
// Passw0rd!. Each test creates its OWN project, so tests never share sprint
// state (no cross-test pollution).

async function signIn(page: Page, email: string, password = "Passw0rd!") {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

// Create a fresh project and land on its Issues tab. The creator is its LEAD.
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

// Assumes we're on the project's Issues tab (where the create control lives).
async function createBacklogIssue(page: Page, title: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 15000 });
}

async function goToBacklog(page: Page) {
  await page.getByRole("link", { name: /^Backlog$/i }).click();
  await page.waitForURL(/\/backlog/);
}

async function createSprint(page: Page, name: string) {
  await page.getByRole("button", { name: /create sprint/i }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/sprint created/i)).toBeVisible({ timeout: 15000 });
}

// dnd-kit uses a PointerSensor with a 5px activation distance, so a plain
// dragTo() won't trigger it — drive discrete pointer moves with settle delays
// so the library registers activation and the over-target before drop.
async function pointerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 5 }); // pass the 5px activation
  await page.waitForTimeout(60);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / 12,
      from.y + ((to.y - from.y) * i) / 12,
      { steps: 2 },
    );
  }
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.waitForTimeout(120); // let collision settle on the target
  await page.mouse.up();
  await page.waitForTimeout(60);
}

async function dragCardInto(page: Page, cardText: string | RegExp, dropZone: ReturnType<Page["getByText"]>) {
  const card = page.getByText(cardText).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  const hb = await card.boundingBox();
  const zb = await dropZone.boundingBox();
  if (!hb || !zb) throw new Error("missing bounding boxes");
  await pointerDrag(
    page,
    { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 },
    { x: zb.x + zb.width / 2, y: zb.y + zb.height / 2 },
  );
}

test("LEAD can create a sprint and drag a backlog card into it", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Drag ${Date.now()}`);
  const issueTitle = `Sprint drag ${Date.now()}`;
  await createBacklogIssue(page, issueTitle);
  await goToBacklog(page);

  const sprintName = `E2E Sprint ${Date.now()}`;
  await createSprint(page, sprintName);

  const section = page.locator("section").filter({ hasText: sprintName });
  await dragCardInto(page, issueTitle, section.getByText(/drag issues here to plan this sprint/i));

  // That sprint's section now counts the moved issue (0/1 done).
  await expect(section.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
});

// Regression: after completing a sprint, its issues must not persist in the
// panel without a reload (client re-syncs on router.refresh, ADR-0014 follow-up),
// and the completed sprint appears in history and is deletable.
test("completing a sprint moves it to history and re-syncs the panel", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Lifecycle ${Date.now()}`);
  await goToBacklog(page);

  await createSprint(page, `Lifecycle Sprint ${Date.now()}`);

  await page.getByRole("button", { name: /start sprint/i }).click();
  await page.getByLabel("Start date").fill("2026-08-01T09:00");
  await page.getByLabel("End date").fill("2026-08-14T09:00");
  await page.getByRole("dialog").getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/sprint started/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /complete sprint/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^complete$/i }).click();
  await expect(page.getByText(/sprint completed/i)).toBeVisible({ timeout: 15000 });

  // Without a reload: it's gone from the planning area and shows in history.
  await expect(page.getByText(/completed sprints/i)).toBeVisible({ timeout: 15000 });

  // Delete it from history.
  await page
    .getByText(/completed sprints/i)
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name: /^delete$/i })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(/sprint deleted/i)).toBeVisible({ timeout: 15000 });
});

// Multi-sprint planning (ADR-0015): several sprints coexist as sections; an
// issue can be dragged into a chosen one.
test("LEAD can plan multiple sprints and drag into a chosen one", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Multi ${Date.now()}`);
  const issueTitle = `Multi issue ${Date.now()}`;
  await createBacklogIssue(page, issueTitle);
  await goToBacklog(page);

  const stamp = Date.now();
  const alpha = `Alpha ${stamp}`;
  const beta = `Beta ${stamp}`;
  await createSprint(page, alpha);
  await createSprint(page, beta);

  const alphaSection = page.locator("section").filter({ hasText: alpha });
  const betaSection = page.locator("section").filter({ hasText: beta });
  await expect(alphaSection).toBeVisible({ timeout: 15000 });
  await expect(betaSection).toBeVisible({ timeout: 15000 });

  // Drag the backlog card specifically into the Beta section.
  await dragCardInto(page, issueTitle, betaSection.getByText(/drag issues here to plan this sprint/i));

  // Beta counts the issue; Alpha stays empty — it landed in the chosen sprint.
  await expect(betaSection.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
  await expect(alphaSection.getByText(/0\/0 done/i)).toBeVisible({ timeout: 15000 });
});
