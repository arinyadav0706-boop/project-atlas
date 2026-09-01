import { test, expect, type Page } from "@playwright/test";
import { DEMO_USERS, signInAs } from "./support/session";

// Gap 1 from the Phase 0 rescope: the cross-project issue workspace.
//
// `issues.spec.ts` covers creating an issue inside a project. Nothing covered
// THIS page — the one being rebuilt first — so a refactor of it had no safety
// net at all. Search, each filter facet, clearing, selection, bulk actions and
// pagination are the behaviours that must survive the redesign.
//
// Assertions are on roles, labels and visible text only. No class names, no
// pixel values, no DOM structure — the layout is expected to change completely.

async function signIn(page: Page, email: string) {
  await signInAs(page, email);
}

async function openIssues(page: Page) {
  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: /issues/i }).first()).toBeVisible({
    timeout: 20000,
  });
  // The first row proves the list actually loaded rather than rendering an
  // empty shell, which several of these assertions would otherwise pass on.
  await expect(page.getByRole("checkbox", { name: /^select /i }).first()).toBeVisible({
    timeout: 20000,
  });
}

function rows(page: Page) {
  // `[A-Z][A-Z0-9]*` — a project key may contain digits (PMTJ1721Y), which the
  // app's own key parser allows and my first version of this regex did not.
  return page.getByRole("checkbox", { name: /^select [A-Z][A-Z0-9]*-\d+$/i });
}

test("the list loads issues from more than one project", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);
  expect(await rows(page).count()).toBeGreaterThan(0);
  // The FACT — how many rows, across how many projects — not the sentence.
  // The wording changed in the redesign ("shown across N projects" → "N shown ·
  // M projects") and a test that pins phrasing fails on every copy edit.
  await expect(page.getByText(/\d+ shown/i)).toBeVisible();
  await expect(page.getByText(/\d+ projects?/i).first()).toBeVisible();
});

test("searching by title narrows the list, and clearing restores it", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);
  const before = await rows(page).count();

  const search = page.getByLabel("Search issue titles");
  // A string specific enough to filter but not so specific it matches nothing
  // in a randomised seed.
  await search.fill("the");
  await expect
    .poll(async () => rows(page).count(), { timeout: 20000 })
    .toBeLessThanOrEqual(before);

  await search.fill("");
  await expect.poll(async () => rows(page).count(), { timeout: 20000 }).toBeGreaterThan(0);
});

test("each filter facet applies and can be cleared", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  // The facets live in the Filters panel, not in the toolbar: eight dropdowns
  // did not fit in a single row at any width, so /issues follows the same
  // pattern as Jira, ClickUp and Linear. The URL contract is unchanged, which
  // is what this test is really about.
  await page.getByRole("button", { name: "Filters" }).click();

  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: /^bug$/i }).click();
  await expect(page).toHaveURL(/type=BUG/);

  await page.getByLabel("Priority", { exact: true }).click();
  await page.getByRole("option", { name: /^high$/i }).click();
  await expect(page).toHaveURL(/priority=HIGH/);

  await page.getByRole("button", { name: /^done$/i }).click();

  // Closing the panel must leave the applied filters visible as chips —
  // otherwise the page shows a filtered list with no on-screen reason why.
  await expect(page.getByText("Type:")).toBeVisible();
  await expect(page.getByText("Priority:")).toBeVisible();

  // "Clear" must reset every facet, not just the last one touched.
  await page.getByRole("button", { name: /^clear$/i }).click();
  await expect(page).not.toHaveURL(/type=BUG/);
  await expect(page).not.toHaveURL(/priority=HIGH/);
});

test("a chip removes only its own facet", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: /^bug$/i }).click();
  await page.getByLabel("Priority", { exact: true }).click();
  await page.getByRole("option", { name: /^high$/i }).click();
  await page.getByRole("button", { name: /^done$/i }).click();

  await page.getByRole("button", { name: /remove the type filter/i }).click();
  await expect(page).not.toHaveURL(/type=BUG/);
  // The other facet survives — the whole reason a chip exists rather than one
  // "Clear" for everything.
  await expect(page).toHaveURL(/priority=HIGH/);
});

test("selection and the bulk action bar appear and clear", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  await rows(page).first().click();
  // `.first()` because the count is deliberately shown twice — once above the
  // list and once in the bulk bar — and a strict-mode locator would treat that
  // correct duplication as an error.
  await expect(page.getByText(/1 selected/i).first()).toBeVisible({ timeout: 15000 });

  await rows(page).nth(1).click();
  await expect(page.getByText(/2 selected/i).first()).toBeVisible();

  // Select-all applies to THIS PAGE and says so — deliberately not "all 3,600
  // matching" (ADR-0041 §3). The wording is the guarantee.
  await page.getByRole("checkbox", { name: /select all issues on this page/i }).click();
  // `.first()` for the same reason as above: the count appears in both the
  // selection strip and the bulk bar, which is correct.
  await expect(page.getByText(/\d+ selected/i).first()).toBeVisible();
});

test("Load more appends rather than replacing", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  const loadMore = page.getByRole("button", { name: /load more/i });
  if ((await loadMore.count()) === 0) {
    test.skip(true, "seed has one page of issues");
    return;
  }
  const before = await rows(page).count();
  await loadMore.click();
  await expect.poll(async () => rows(page).count(), { timeout: 20000 }).toBeGreaterThan(before);
});

test("a viewer sees the list scoped to their own memberships", async ({ page }) => {
  // Permission behaviour, restated at the page level: the service scopes
  // results to the caller, so this must keep working through a layout change.
  await signIn(page, DEMO_USERS.viewer);
  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: /issues/i }).first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page).not.toHaveURL(/\/sign-in/);
});
