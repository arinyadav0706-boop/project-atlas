import { defineConfig, devices } from "@playwright/test";

// E2E config. Needs a running app + a seeded test database. The webServer
// block boots `next dev` against whatever DATABASE_URL is in the environment,
// so point it at a disposable Postgres (see docs/08_Testing/01_Testing_Strategy.md),
// run migrations + `npm run prisma:seed`, then `npx playwright test`.
const CHROME = process.env.PW_CHROMIUM_PATH; // set when using a preinstalled browser

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
    ...(CHROME ? { launchOptions: { executablePath: CHROME } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "next dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
