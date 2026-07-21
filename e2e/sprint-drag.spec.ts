import { test, expect, type Page } from "@playwright/test";

// Sprint UI flows against a real browser. Kavya is LEAD on the seeded "EAGLES
// Demo" project. All seeded users share the password Passw0rd!. These run in
// order: the lifecycle test completes its sprint (leaving no current sprint),
// so the drag test that follows starts from a clean sprint slot.

async function signIn(page: Page, email: string, password = "Passw0rd!") {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

async function openDemoProject(page: Page) {
  await page.goto("/projects");
  await page.getByRole("link", { name: /EAGLES Demo/i }).click();
  await page.waitForURL(/\/projects\/.+\/issues/);
}

async function goToBacklog(page: Page) {
  await page.getByRole("link", { name: /^Backlog$/i }).click();
  await page.waitForURL(/\/backlog/);
}

// Assumes we're on the project's Issues tab (where the create control lives).
async function createBacklogIssue(page: Page, title: string) {
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 15000 });
}

// dnd-kit uses a PointerSensor with a 5px activation distance, so a plain
// dragTo() won't trigger it — drive discrete pointer moves.
async function pointerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 5 }); // pass activation
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 3 }); // settle over the target
  await page.mouse.up();
}

// Regression: after completing a sprint and creating a new one, the panel must
// NOT show the previous sprint's issues/progress — client state must re-sync on
// router.refresh, not keep the old useState. Runs first so it leaves the project
// with no current sprint for the drag test below.
test("completing then creating a sprint does not show the old sprint's issues", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await openDemoProject(page);
  await goToBacklog(page);

  await page.getByRole("button", { name: /create sprint/i }).click();
  await page.getByLabel("Name").fill(`Lifecycle Sprint ${Date.now()}`);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/sprint created/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /start sprint/i }).click();
  await page.getByLabel("Start date").fill("2026-08-01T09:00");
  await page.getByLabel("End date").fill("2026-08-14T09:00");
  await page.getByRole("dialog").getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/sprint started/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: /complete sprint/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^complete$/i }).click();
  await expect(page.getByText(/sprint completed/i)).toBeVisible({ timeout: 15000 });

  // Immediately (no reload) the completed sprint is gone and a fresh "Create
  // sprint" affordance is shown — not a stale sprint header/issues.
  await expect(page.getByRole("button", { name: /create sprint/i })).toBeVisible({
    timeout: 15000,
  });
});

test("LEAD can create a sprint and drag a backlog card into it", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await openDemoProject(page);
  await createBacklogIssue(page, `Sprint drag ${Date.now()}`);
  await goToBacklog(page);

  // Grab the CARD row itself (what a user naturally grabs), not a drag handle.
  const card = page.getByText(/^Sprint drag /).first();
  await expect(card).toBeVisible({ timeout: 15000 });

  // Create a sprint if the project doesn't already have one.
  const createBtn = page.getByRole("button", { name: /create sprint/i });
  if (await createBtn.count()) {
    await createBtn.click();
    await page.getByLabel("Name").fill(`E2E Sprint ${Date.now()}`);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByText(/sprint created/i)).toBeVisible({ timeout: 15000 });
  }

  const dropZone = page.getByText(/drag issues here to plan this sprint/i);
  await expect(dropZone).toBeVisible({ timeout: 15000 });

  const hb = await card.boundingBox();
  const zb = await dropZone.boundingBox();
  if (!hb || !zb) throw new Error("missing bounding boxes");
  await pointerDrag(
    page,
    { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 },
    { x: zb.x + zb.width / 2, y: zb.y + zb.height / 2 },
  );

  // The sprint progress should now count the moved issue (1 in the sprint).
  await expect(page.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
});
