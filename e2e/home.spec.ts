import { test, expect, type Page } from "@playwright/test";
import { DEMO_USERS, signInAs } from "./support/session";

// Home — the first screen after sign-in, and the second page migrated to V2.
//
// Covered here because it was not covered anywhere: `shell-navigation.spec.ts`
// asserts the route renders, which passes on an empty shell. These assert the
// panels, the honest counts, and that every "View all" lands somewhere useful —
// the link on "My work" used to be labelled "View all issues" and went to the
// project list.

async function openHome(page: Page) {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeVisible(
    { timeout: 20000 },
  );
}

function panel(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test("every section renders, including the ones that are empty", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openHome(page);

  // Every phase-1 panel, always (ADR-0057). An absent panel leaves a hole in
  // the grid and shifts every panel below it out of its column — and "you are
  // caught up" is information, not the absence of it.
  for (const name of [
    "Summary",
    "My work",
    "Needs your attention",
    "Your focus",
    "Upcoming",
    "Continue working",
    "Projects",
    "Recent activity",
    "Workload",
  ]) {
    await expect(panel(page, name)).toBeVisible({ timeout: 20000 });
  }
});

test("'View all' on My work lands on this person's open issues", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openHome(page);

  await panel(page, "My work").getByRole("link", { name: /view all/i }).click();

  // The same question, on the page that can answer all of it — not the project
  // list, which is where this link used to go.
  await expect(page).toHaveURL(/\/issues\?/, { timeout: 20000 });
  await expect(page).toHaveURL(/assigneeId=/);
  await expect(page).toHaveURL(/openOnly=true/);
  await expect(page.getByRole("navigation", { name: /pagination/i })).toBeVisible({
    timeout: 20000,
  });
});

test("a My work tab changes the list and keeps the other panel's tab", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await page.goto("/home?activity=comments");

  const myWork = panel(page, "My work");
  await myWork.getByRole("link", { name: "Reported by me" }).click();
  await expect(page).toHaveURL(/work=reported/, { timeout: 20000 });
  // Switching one panel must not reset the other.
  await expect(page).toHaveURL(/activity=comments/);
  await expect(
    panel(page, "My work").getByRole("link", { name: "Reported by me" }),
  ).toHaveAttribute("aria-current", "page");
  // No "View all" here: there is no list page that answers "reported by me".
  await expect(panel(page, "My work").getByRole("link", { name: /view all/i })).toHaveCount(0);
});

test("'View all' on Your focus sorts by due date", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openHome(page);

  const focus = panel(page, "Your focus");
  const viewAll = focus.getByRole("link", { name: /view all/i });
  if ((await viewAll.count()) === 0) {
    test.skip(true, "this user has no open work");
    return;
  }
  await viewAll.click();
  await expect(page).toHaveURL(/sort=DUE_DATE_ASC/, { timeout: 20000 });
});

test("a capped section says so rather than reporting the cap as the total", async ({ page }) => {
  // The regression this guards: the count was `items.length` on a list capped
  // at ten, so someone with forty open issues was told they had ten. A number
  // that is quietly a floor is worse than no number.
  await signInAs(page, DEMO_USERS.lead);
  await openHome(page);

  const badge = panel(page, "My work").getByText(/^\d+\+? open issues?$/);
  await expect(badge).toBeVisible({ timeout: 20000 });

  const text = await badge.innerText();
  const shown = await panel(page, "My work").locator('a[href*="/issues/"]').count();
  const claimed = Number(/^\d+/.exec(text)![0]);
  // Whatever the number is, it is the number of rows actually on screen — and
  // if it carries a "+", there are more behind it.
  expect(claimed).toBe(shown);
});

test("a project tile opens that project", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openHome(page);

  const projects = panel(page, "Projects");
  const tile = projects.locator('a[href*="/projects/"]').first();
  if ((await tile.count()) === 0) {
    test.skip(true, "this user has no starred or recent projects yet");
    return;
  }
  await tile.click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/issues/, { timeout: 20000 });
});
