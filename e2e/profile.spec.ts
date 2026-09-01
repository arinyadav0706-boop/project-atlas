import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Profile (16_profile.md): a user edits their own name + in-app notifications
// toggle and uploads an avatar; changes persist and the top bar refreshes.
// Kavya signs in with the shared password.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

// A 1x1 transparent PNG.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("save name via button and flip notifications instantly; both persist", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/profile");

  // Email is read-only.
  await expect(page.getByLabel("Email")).toBeDisabled();

  // Name is saved via the "Save changes" button.
  const stamp = Date.now().toString(36);
  const newName = `Kavya ${stamp}`;
  await page.getByLabel("Name", { exact: true }).fill(newName);
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/name updated/i)).toBeVisible({ timeout: 15000 });

  // The notifications switch is its own save — flipping it persists immediately,
  // no button press.
  const toggle = page.getByRole("switch", { name: /in-app notifications/i });
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(page.getByText(/notifications (on|off)/i)).toBeVisible({ timeout: 15000 });
  const after = await toggle.getAttribute("aria-checked");
  expect(after).not.toBe(before);

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
