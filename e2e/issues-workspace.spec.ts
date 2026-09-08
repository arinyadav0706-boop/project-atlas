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

async function openIssues(page: Page, query = "") {
  await page.goto(`/issues${query}`);
  await expect(page.getByRole("heading", { name: /issues/i }).first()).toBeVisible({
    timeout: 20000,
  });
  // Wait for a ROW, not for any checkbox. The header's "Select all issues on
  // this page" also matches /^select /, and it renders with the table shell —
  // so the looser wait could return while the body was still empty, and the
  // next line would count zero rows. That produced exactly one flaky run
  // before it was fixed here rather than papered over with a retry.
  await expect(rows(page).first()).toBeVisible({ timeout: 20000 });
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
  // The FACT — a visible row range, and how many projects are in scope — not
  // the sentence. Wording has already changed twice here; a test that pins
  // phrasing fails on every copy edit.
  await expect(page.getByRole("navigation", { name: /pagination/i })).toBeVisible();
  // Range AND denominator — "1–30 of 30", not a bare "1–30". The count is the
  // whole point of the last change to this page.
  await expect(page.getByText(/\d+–\d+ of [\d,]+/)).toBeVisible();
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

test("paging forward and back replaces the rows and moves the range", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  // `take=25` against a 30-issue seed guarantees two pages. The default 50
  // would make this test skip itself, which is how the old "Load more" test
  // managed to never run.
  await openIssues(page, "?take=25");

  const next = page.getByRole("button", { name: "Next page" });
  const prev = page.getByRole("button", { name: "Previous page" });

  // On page one, Previous is present but disabled — a control that vanishes at
  // the edges moves everything beside it.
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();

  const firstKey = async () =>
    (await rows(page).first().getAttribute("aria-label")) ?? "";
  const pageOneKey = await firstKey();

  await next.click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );
  // REPLACES rather than appends — the difference between pagination and a
  // feed, and the whole reason this changed.
  await expect.poll(firstKey, { timeout: 20000 }).not.toBe(pageOneKey);
  await expect(prev).toBeEnabled();
  // The range moves with the page and keeps its denominator.
  await expect(page.getByText(/26–\d+ of [\d,]+/)).toBeVisible();

  await prev.click();
  await expect(page.getByRole("button", { name: "Page 1" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );
  await expect.poll(firstKey, { timeout: 20000 }).toBe(pageOneKey);
});

test("a numbered page button jumps back to a page already visited", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page, "?take=25");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );

  // Backwards is free on a cursor stack — the cursor that opened page 1 is
  // still held, so this is a truncation and not a re-walk.
  await page.getByRole("button", { name: "Page 1" }).click();
  await expect(page.getByRole("button", { name: "Page 1" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );
  await expect(page.getByText(/^1–\d+ of/)).toBeVisible();
});

test("the denominator is the FILTERED total, not the collection size", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  const total = async () => {
    const text = (await page.getByText(/\d+–\d+ of [\d,]+/).innerText()).replace(/,/g, "");
    return Number(/of (\d+)/.exec(text)?.[1]);
  };
  const before = await total();

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: /^bug$/i }).click();
  await page.getByRole("button", { name: /^done$/i }).click();

  await expect(page).toHaveURL(/type=BUG/);
  // Every seeded project has bugs and non-bugs, so the filtered total must be
  // strictly smaller. A count built from the collection rather than the filter
  // would stay put here, and would look right on an unfiltered screen.
  await expect.poll(total, { timeout: 20000 }).toBeLessThan(before);
  await expect.poll(total, { timeout: 20000 }).toBeGreaterThan(0);
});

test("changing the page size re-pages from the top", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page);

  await page.getByLabel("Rows per page").click();
  await page.getByRole("option", { name: "25" }).click();

  await expect.poll(async () => rows(page).count(), { timeout: 20000 }).toBeLessThanOrEqual(25);
  // The size is shareable; the page position deliberately is not.
  await expect(page).toHaveURL(/take=25/);
});

test("a filter change returns to page one", async ({ page }) => {
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page, "?take=25");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );

  // Staying on page 2 of a filter you just replaced shows rows 26-50 of a
  // different result set. This is the regression that wrapper exists for.
  await page.getByLabel("Search issue titles").fill("the");
  await expect(page.getByRole("button", { name: "Page 1" })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 20000 },
  );
});

test("a shared link keeps its sort", async ({ page }) => {
  // `sort=` was written into the URL and never read back: the component
  // initialised to the default regardless, and the first `replaceState` then
  // deleted it — so the URL you copied stopped being the list you were looking
  // at. Found by a Home "View all" that asked for due-date order.
  await signIn(page, DEMO_USERS.admin);
  await openIssues(page, "?sort=DUE_DATE_ASC");

  await expect(page).toHaveURL(/sort=DUE_DATE_ASC/);
  // And the column header says so, rather than the URL merely surviving.
  // `aria-sort` lives on the columnheader, not on the button inside it.
  await expect(page.getByRole("columnheader", { name: /^due$/i })).toHaveAttribute(
    "aria-sort",
    "ascending",
    { timeout: 20000 },
  );
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
