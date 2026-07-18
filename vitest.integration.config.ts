import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run against a REAL Postgres (set DATABASE_URL/DIRECT_URL
// to a disposable test database, apply migrations, then run). See
// docs/08_Testing/01_Testing_Strategy.md for the one-command runner.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // A shared DB means tests must not run in parallel across files.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
