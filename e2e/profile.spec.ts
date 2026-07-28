import { test, expect, type Page } from "@playwright/test";

// Profile (16_profile.md): a user edits their own name + in-app notifications
// toggle and uploads an avatar; changes persist and the top bar refreshes.
// Kavya signs in with the shared password.

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Passw0rd!");
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(home|dashboard|projects)/);
}

// A 1x1 transparent PNG.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("edit name + notifications toggle, and it persists", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/profile");

  // Email is read-only.
  await expect(page.getByLabel("Email")).toBeDisabled();

  const stamp = Date.now().toString(36);
  const newName = `Kavya ${stamp}`;
  const nameField = page.getByLabel("Name", { exact: true });
  await nameField.fill(newName);

  // Flip the notifications switch and remember its new state.
  const toggle = page.getByRole("switch", { name: /in-app notifications/i });
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  const after = await toggle.getAttribute("aria-checked");
  expect(after).not.toBe(before);

  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/profile updated/i)).toBeVisible({ timeout: 15000 });

  // Reload → both changes stuck.
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(newName);
  await expect(page.getByRole("switch", { name: /in-app notifications/i })).toHaveAttribute(
    "aria-checked",
    after!,
  );
});

test("upload and remove an avatar", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/profile");

  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await expect(page.getByText(/avatar updated/i)).toBeVisible({ timeout: 15000 });

  // The avatar image now renders (the proxy URL) on the page…
  await expect(page.locator('img[src*="/avatar"]').first()).toBeVisible({ timeout: 15000 });
  // …and the top-bar avatar updates live via the session refresh (ADR-0027).
  await expect(page.locator('header img[src*="/avatar"]')).toBeVisible({ timeout: 15000 });

  // Remove it.
  await page.getByRole("button", { name: /remove avatar/i }).click();
  await expect(page.getByText(/avatar removed/i)).toBeVisible({ timeout: 15000 });
});
