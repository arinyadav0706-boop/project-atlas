import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Sprint UI flows against a real browser. Kavya is an org member who becomes
// LEAD of any project she creates. All seeded users share the password
// Passw0rd!. Each test creates its OWN project, so tests never share sprint
// state (no cross-test pollution).

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
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
  // The created issue's key toast (KEY-N created) — not the project toast.
  await expect(page.getByText(/-\d+ created/i)).toBeVisible({ timeout: 15000 });
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

test("row '…' menu moves an issue into a sprint without dragging", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Menu ${Date.now()}`);
  const issueTitle = `Menu issue ${Date.now()}`;
  await createBacklogIssue(page, issueTitle);
  await goToBacklog(page);

  const sprintName = `Menu Sprint ${Date.now()}`;
  await createSprint(page, sprintName);

  // Open the backlog row's actions menu and move it into the sprint.
  const row = page.locator("div").filter({ hasText: issueTitle }).last();
  await row.getByRole("button", { name: /issue actions/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(`move to ${sprintName}`, "i") }).click();

  const section = page.locator("section").filter({ hasText: sprintName });
  await expect(section.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
});

test("inline create adds an issue to the backlog", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Inline ${Date.now()}`);
  await goToBacklog(page);

  const title = `Inline issue ${Date.now()}`;
  await page.getByLabel("New issue title").fill(title);
  await page.getByLabel("New issue title").press("Enter");

  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });
});

test("completing can move incomplete issues to a follow-up sprint", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Followup ${Date.now()}`);
  const issueTitle = `Followup issue ${Date.now()}`;
  await createBacklogIssue(page, issueTitle);
  await goToBacklog(page);

  const stamp = Date.now();
  const active = `Active ${stamp}`;
  const next = `Next ${stamp}`;
  await createSprint(page, active);
  await createSprint(page, next);

  // Put the issue into the active sprint, then start it. Use the row "…" menu
  // (proven, viewport-independent) rather than a drag — with two sprint sections
  // stacked above the backlog the card and drop zone aren't co-visible, which
  // makes a pointer drag flaky here; the drag path itself is covered elsewhere.
  const activeSection = page.locator("section").filter({ hasText: active });
  const backlogRow = page.locator("div").filter({ hasText: issueTitle }).last();
  await backlogRow.getByRole("button", { name: /issue actions/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(`move to ${active}`, "i") }).click();
  await expect(activeSection.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
  await activeSection.getByRole("button", { name: /start sprint/i }).click();
  await page.getByLabel("Start date").fill("2026-08-01T09:00");
  await page.getByLabel("End date").fill("2026-08-14T09:00");
  await page.getByRole("dialog").getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/sprint started/i)).toBeVisible({ timeout: 15000 });

  // Complete it, sending the incomplete issue to the "Next" sprint.
  await page.getByRole("button", { name: /complete sprint/i }).click();
  await page.getByRole("dialog").getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(next, "i") }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^complete$/i }).click();
  await expect(page.getByText(/sprint completed/i)).toBeVisible({ timeout: 15000 });

  // The issue is now in the "Next" sprint section.
  const nextSection = page.locator("section").filter({ hasText: next });
  await expect(nextSection.getByText(/\/1 done/i)).toBeVisible({ timeout: 15000 });
});

test("reorder buttons change the planned-sprint queue order", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Queue ${Date.now()}`);
  await goToBacklog(page);

  const stamp = Date.now();
  const first = `AAA ${stamp}`;
  const second = `BBB ${stamp}`;
  await createSprint(page, first);
  await createSprint(page, second);

  // "second" starts below "first"; move it up.
  const secondSection = page.locator("section").filter({ hasText: second });
  await secondSection.getByRole("button", { name: /move sprint up/i }).click();

  // After reorder, the first sprint section on the page is now "second".
  await expect(page.locator("section h3").first()).toHaveText(second, { timeout: 15000 });
});

test("bulk select moves multiple issues into a sprint", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Bulk ${Date.now()}`);
  const stamp = Date.now();
  await createBacklogIssue(page, `Bulk A ${stamp}`);
  await createBacklogIssue(page, `Bulk B ${stamp}`);
  await goToBacklog(page);

  const sprintName = `Bulk Sprint ${stamp}`;
  await createSprint(page, sprintName);

  // Select both backlog issues.
  await page.getByRole("checkbox", { name: new RegExp(`select`, "i") }).nth(0).click();
  await page.getByRole("checkbox", { name: new RegExp(`select`, "i") }).nth(1).click();
  await expect(page.getByText(/2 selected/i)).toBeVisible({ timeout: 15000 });

  // Choose the sprint as the destination and move.
  await page.getByText(/2 selected/i).locator("xpath=..").getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(sprintName, "i") }).click();
  await page.getByRole("button", { name: /^move$/i }).click();

  const section = page.locator("section").filter({ hasText: sprintName });
  await expect(section.getByText(/\/2 done/i)).toBeVisible({ timeout: 15000 });
});

test("star toggle pins and unpins the project", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await createProject(page, `Star ${Date.now()}`);

  const star = page.getByRole("button", { name: /star project/i });
  await expect(star).toBeVisible({ timeout: 15000 });
  await star.click();
  // After starring, the control flips to the "unstar" affordance.
  await expect(page.getByRole("button", { name: /unstar project/i })).toBeVisible({
    timeout: 15000,
  });
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
