import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./support/session";

// Admin control plane (13_admin.md, ADR-0022/0023). Seeded: Aditi is org ADMIN,
// Kavya is org MEMBER. Password: Passw0rd!.

async function signIn(page: Page, email: string) {
  // Restores a session saved once by e2e/auth.setup.ts. Posting
  // credentials here would trip the 8-per-15-min auth limiter across a
  // full run (see e2e/support/session.ts).
  await signInAs(page, email);
}

test("an ADMIN sees the console, all tabs, and can toggle a feature flag", async ({ page }) => {
  await signIn(page, "aditi.sharma@consint.ai");

  await page.goto("/admin");
  // Lands on a section and shows the registry-driven tabs (first dynamic render
  // can cold-compile, so allow headroom).
  await expect(page.getByRole("link", { name: "Organization" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: "Feature Flags" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit Log" })).toBeVisible();

  // Feature Flags: toggle a UI-neutral flag (search.fuzzyMatching, default off,
  // not consumed by any screen) so this test can't affect other suites via the
  // shared seed DB. Then confirm the change persists and audits.
  await page.getByRole("link", { name: "Feature Flags" }).click();
  await page.waitForURL(/\/admin\/feature-flags/);
  const toggle = page.getByRole("switch", { name: /search\.fuzzyMatching/ });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  // Assert the flip relative to the current state so the test is idempotent on
  // the shared seed DB (the override is cleaned up on the same page below).
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");

  // Reset on the same page (local state already shows the override) so the seed
  // DB returns to a clean default (search.fuzzyMatching defaults off).
  const resetBtn = page.getByRole("button", { name: /reset to default/i }).first();
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Both changes are recorded in the audit log.
  await page.getByRole("link", { name: "Audit Log" }).click();
  await page.waitForURL(/\/admin\/audit-log/);
  await expect(page.getByText("FEATURE_FLAG_CHANGED").first()).toBeVisible({ timeout: 15000 });
});

test("a non-admin cannot reach the admin console", async ({ page }) => {
  await signIn(page, "kavya.iyer@consint.ai");
  await page.goto("/admin");
  // notFound() → 404; the console header must not render.
  await expect(page.getByRole("link", { name: "Feature Flags" })).toHaveCount(0);
});
