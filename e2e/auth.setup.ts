import { test as setup } from "@playwright/test";
import { DEMO_USERS, authenticate } from "./support/session";

// Runs once, before every other project (see `dependencies` in
// playwright.config.ts). Five credential posts for the whole suite, against a
// limit of eight per fifteen minutes — see support/session.ts for why that
// number matters.

setup("sign in each demo user once", async ({ browser }) => {
  for (const email of Object.values(DEMO_USERS)) {
    await authenticate(browser, email);
  }
});
