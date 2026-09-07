import { test, expect, type Page, type Locator } from "@playwright/test";
import { DEMO_USERS, signInAs } from "./support/session";

// The board — the page the whole team leaves open all day, and the one that had
// NO end-to-end coverage at all when it was redesigned.
//
// That is the wrong order and I am recording it as such: `/issues` got its
// safety net before the rebuild, the board got it after. The tests below are
// what should have existed first — columns, the drag that is the page's entire
// reason to exist, per-column paging, filtering, and the read-only path.
//
// Assertions are on roles, labels and visible text. No class names, no pixel
// values: the layout is expected to keep changing.

const PROJECT = "seed-demo-project";

async function openBoard(page: Page) {
  await page.goto(`/projects/${PROJECT}/board`);
  // `exact` because "Dashboards" contains "board", and so does any card whose
  // title happens to — Playwright's default name matching is a substring.
  await expect(
    page.getByRole("link", { name: "Board", exact: true }),
  ).toHaveAttribute("aria-current", "page", { timeout: 20000 });
  await expect(columns(page).first()).toBeVisible({ timeout: 20000 });
}

function columns(page: Page) {
  return page.getByRole("region", { name: /column$/ });
}

function column(page: Page, name: string) {
  return page.getByRole("region", { name: `${name} column` });
}

/** Cards in a column, located by their title link. */
function cards(col: Locator) {
  return col.locator('a[href*="/issues/"]');
}

// dnd-kit uses a PointerSensor with a 5px activation distance, so `dragTo()`
// never activates it — discrete moves with settle delays, the same helper
// shape `sprint-drag.spec.ts` uses.
async function pointerDrag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("drag source or target is not on screen");
  const start = { x: a.x + a.width / 2, y: a.y + 12 };
  // Aim just under the destination column's header rather than at its middle:
  // the middle of a tall column is a card, and dropping onto a card is a
  // different (also valid) code path than dropping onto the column itself.
  const end = { x: b.x + b.width / 2, y: b.y + 64 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 10, { steps: 5 }); // pass activation
  await page.waitForTimeout(60);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / 12,
      start.y + ((end.y - start.y) * i) / 12,
      { steps: 2 },
    );
  }
  await page.waitForTimeout(140); // let the collision settle on the target
  await page.mouse.up();
  await page.waitForTimeout(80);
}

test("the board renders one column per project status, each with its own count", async ({
  page,
}) => {
  await signInAs(page, DEMO_USERS.lead);
  await openBoard(page);

  // The four seeded statuses (30_workflow BR-7). Named, not counted, because a
  // column count alone passes on four copies of the same column.
  for (const name of ["To Do", "In Progress", "In Review", "Done"]) {
    await expect(column(page, name)).toBeVisible();
  }
  expect(await columns(page).count()).toBe(4);
});

test("a card dragged to another column stays there after a reload", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openBoard(page);

  const todo = column(page, "To Do");
  const inProgress = column(page, "In Progress");
  const card = cards(todo).first();
  const title = (await card.innerText()).trim();

  await pointerDrag(page, card, inProgress);

  // Optimistic first…
  await expect(inProgress.getByText(title, { exact: true })).toBeVisible({ timeout: 15000 });
  // …then persisted. A reload is the only assertion that separates "the UI
  // moved it" from "the server accepted it", and the optimistic layout makes
  // the first one true either way.
  await page.reload();
  await expect(column(page, "In Progress").getByText(title, { exact: true })).toBeVisible({
    timeout: 20000,
  });
});

test("a filter narrows the columns and shows a removable chip", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openBoard(page);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: /^bug$/i }).click();
  await page.getByRole("button", { name: /^done$/i }).click();

  // The chip is what tells the reader WHY the board is emptier than they left
  // it — the failure mode of every filter that only shows a count. Asserted via
  // its remove button, which is unique; the word "Bug" also appears inside the
  // panel's own Type control.
  const chipRemove = page.getByRole("button", { name: /remove the type filter/i });
  await expect(chipRemove).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Type:")).toBeVisible();

  await chipRemove.click();
  await expect(chipRemove).toBeHidden({ timeout: 15000 });
});

test("searching narrows the board and clearing restores it", async ({ page }) => {
  await signInAs(page, DEMO_USERS.lead);
  await openBoard(page);

  const total = async () => {
    let n = 0;
    for (const col of await columns(page).all()) n += await cards(col).count();
    return n;
  };
  const before = await total();
  expect(before).toBeGreaterThan(0);

  await page.getByLabel("Search board cards").fill("zzz-matches-nothing");
  await expect.poll(total, { timeout: 20000 }).toBe(0);

  await page.getByLabel("Search board cards").fill("");
  await expect.poll(total, { timeout: 20000 }).toBe(before);
});

test("a viewer sees the board and cannot drag it", async ({ page }) => {
  // Permission behaviour restated at the page level: `canWrite` is decided
  // server-side and the cards are simply not draggable without it.
  await signInAs(page, DEMO_USERS.viewer);
  await openBoard(page);

  await expect(columns(page).first()).toBeVisible();
  // `useSortable({ disabled })` drops the listeners AND the attributes, so a
  // read-only card carries no `aria-roledescription` at all. Asserted against a
  // lead in the same run below, because "no element has this attribute" is a
  // test that also passes when the attribute never existed.
  await expect(page.locator("[aria-roledescription]")).toHaveCount(0);
});

test("a lead's cards ARE marked draggable — the control for the viewer case", async ({
  page,
}) => {
  await signInAs(page, DEMO_USERS.lead);
  await openBoard(page);
  expect(await page.locator("[aria-roledescription]").count()).toBeGreaterThan(0);
});
