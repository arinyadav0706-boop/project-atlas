import { test, expect, type Page } from "@playwright/test";

// Reproduces the reported bug: dragging a backlog issue into the sprint section.
// Kavya is LEAD on the seeded "EAGLES Demo" project. All seeded users: Passw0rd!.

async function signIn(page: Page, email: string, password = "Passw0rd!") {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
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

test("LEAD can create a sprint and drag a backlog issue into it", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");

  // Open the demo project's backlog.
  await page.goto("/projects");
  await page.getByRole("link", { name: /EAGLES Demo/i }).click();
  await page.waitForURL(/\/projects\/.+\/issues/);

  // Ensure at least one backlog issue exists (create one).
  await page.getByRole("button", { name: /new issue/i }).first().click();
  await page.getByLabel("Title").fill(`Sprint drag ${Date.now()}`);
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: /^Backlog$/i }).click();
  await page.waitForURL(/\/backlog/);

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

  // The sprint drop zone appears.
  const dropZone = page.getByText(/drag issues here to plan this sprint/i);
  await expect(dropZone).toBeVisible({ timeout: 15000 });

  // Drag the backlog card (by its body) into the sprint drop zone.
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
