import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// User Management (14_user_management.md). Aditi is org ADMIN, Kavya is MEMBER.
// Password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

test("an ADMIN can invite a user and deactivate them", async ({ page }) => {
  await signIn(page, "aditi.sharma@consint.ai");

  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: "Users" })).toBeVisible({ timeout: 15000 });

  // Invite a uniquely-named user.
  const stamp = Date.now().toString(36);
  const email = `invitee.${stamp}@consint.ai`;
  await page.getByRole("button", { name: /invite user/i }).click();
  await page.getByLabel("Name").fill(`Invitee ${stamp}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /send invite/i }).click();

  // The new user appears with an "Invited" badge.
  const row = page.getByRole("row", { name: new RegExp(email, "i") });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByText("Invited")).toBeVisible();

  // Deactivate them; the row flips to Deactivated.
  await row.getByRole("button", { name: /deactivate/i }).click();
  await expect(row.getByText("Deactivated")).toBeVisible({ timeout: 15000 });
});

test("a non-admin cannot reach the Users tab", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/admin/users");
  await expect(page.getByRole("button", { name: /invite user/i })).toHaveCount(0);
});
