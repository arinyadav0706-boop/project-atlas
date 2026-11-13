import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, signInAs } from "./support/session";

// Timesheets, Screen 1 — the main flow end to end (docs/02_Modules/37_timesheets.md
// §6). The demo team has no team manager, so the org admin approves: this also
// proves the "no team manager → org admin" fallback (ADR-0059 Q5).
//
// Each test uses a random week long in the past, so a re-run never lands on a
// week an earlier run already submitted, and never depends on today's date
// ("no future days" would otherwise make the current week flaky on Mondays).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function randomPastMonday(): string {
  const weeksAgo = 120 + Math.floor(Math.random() * 600);
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

function notificationLabel(monday: string): string {
  const start = new Date(`${monday}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const f = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${f(start)} – ${f(end)}`;
}

// Opens an empty draft week for the signed-in member (retrying the rare
// collision with a week a previous run used).
async function openFreshWeek(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const monday = randomPastMonday();
    await page.goto(`/timesheets?date=${monday}`);
    await expect(page.getByRole("heading", { name: "My Timesheet" })).toBeVisible();
    if (await page.getByText("Nothing logged this week yet").isVisible()) return monday;
  }
  throw new Error("Could not find an empty week to test with");
}

async function logActivityHour(page: Page) {
  await page.getByRole("button", { name: "Add activity" }).click();
  await page.getByRole("button", { name: "Internal meeting" }).first().click();
  await page.getByRole("button", { name: "Add row" }).last().click();
  const monday = page.getByRole("button", { name: /^Internal meeting, Mon, .*: empty$/ });
  await monday.click();
  await page.keyboard.type("1.5");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Internal meeting, Mon, .*: 1h 30m$/ })).toBeVisible();
  await expect(page.getByText("Autosaved just now")).toBeVisible();
}

async function openFromNotification(page: Page, monday: string) {
  await page.goto("/notifications");
  await page.getByText(`Ananya Reddy submitted their timesheet for ${notificationLabel(monday)}`).first().click();
  await expect(page.getByRole("heading", { name: "Ananya Reddy’s timesheet" })).toBeVisible();
}

// Each test signs in two people and walks a whole approval flow; the default
// 30s is tight on a cold dev server (first compile of /notifications).
test.describe.configure({ mode: "serial", timeout: 90_000 });

test("submit is blocked on an empty week, then submit → approve → locked", async ({ browser }) => {
  const member = await browser.newPage();
  await signInAs(member, DEMO_USERS.member);
  const monday = await openFreshWeek(member);

  // BR-24: an empty week cannot be submitted; the panel says why.
  await member.getByRole("button", { name: "Submit Timesheet" }).click();
  const panel = member.getByRole("complementary", { name: "Can't submit timesheet" });
  await expect(panel.getByText("Nothing logged")).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();

  // BR-5: "1.5" is an hour and a half; the cell autosaves.
  await logActivityHour(member);
  await expect(member.getByText("1h 30m").first()).toBeVisible();

  await member.getByRole("button", { name: "Submit Timesheet" }).click();
  await expect(member.getByText("Submitted", { exact: true }).first()).toBeVisible();
  // No team manager, so an org admin stands in (Q5) — any admin may act.
  await expect(member.getByText("Chosen when you submit")).toHaveCount(0);

  // The admin approves from her notification.
  const admin = await browser.newPage();
  await signInAs(admin, DEMO_USERS.admin);
  await openFromNotification(admin, monday);
  await admin.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(admin.getByText("Locked", { exact: true })).toBeVisible();

  // BR-27/28: approved, locked, read-only — the cell can no longer be edited.
  await member.reload();
  await expect(member.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(member.getByText("Locked", { exact: true })).toBeVisible();
  await expect(member.getByRole("button", { name: /^Internal meeting, Mon, .*: 1h 30m$/ })).toBeDisabled();
  await expect(member.getByRole("button", { name: "Edit timesheet" })).toBeDisabled();

  await member.getByRole("button", { name: "View approval history" }).click();
  await expect(member.getByText("Submission 1")).toBeVisible();
  await expect(member.getByRole("dialog").getByText(/Aditi Sharma · Approved/)).toBeVisible();
});

test("a returned line is the only one editable, and resubmitting reopens approval", async ({ browser }) => {
  const member = await browser.newPage();
  await signInAs(member, DEMO_USERS.member);
  const monday = await openFreshWeek(member);
  await logActivityHour(member);
  await member.getByRole("button", { name: "Submit Timesheet" }).click();
  await expect(member.getByText("Submitted", { exact: true }).first()).toBeVisible();

  const admin = await browser.newPage();
  await signInAs(admin, DEMO_USERS.admin);
  await openFromNotification(admin, monday);
  await admin.getByRole("checkbox", { name: "Return Internal meeting" }).check();
  await admin.getByRole("button", { name: "Return 1 line" }).click();
  await admin.getByRole("dialog").locator("textarea").first().fill("Split this across Monday and Tuesday");
  await admin.getByRole("button", { name: "Return", exact: true }).click();
  await expect(admin.getByText("Returned", { exact: true }).first()).toBeVisible();

  // BR-26: the member sees why, and only that line can change.
  await member.reload();
  await expect(member.getByText("Returned for changes")).toBeVisible();
  await expect(member.getByText("Split this across Monday and Tuesday")).toBeVisible();
  const monCell = member.getByRole("button", { name: /^Internal meeting, Mon, .*: 1h 30m$/ });
  await expect(monCell).toBeEnabled();
  await monCell.click();
  await member.keyboard.type("1");
  await member.keyboard.press("Enter");
  await expect(member.getByRole("button", { name: /^Internal meeting, Mon, .*: 1h$/ })).toBeVisible();

  await member.getByRole("button", { name: "Resubmit" }).click();
  await expect(member.getByText("Submitted", { exact: true }).first()).toBeVisible();
  await expect(member.getByText("Returned for changes")).toHaveCount(0);
});
