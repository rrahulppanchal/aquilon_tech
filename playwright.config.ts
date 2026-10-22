import { defineConfig } from "@playwright/test"
// Browser tests sign in with the seeded demo accounts, so they need the same
// environment as the app. They create their own quotes and delete them after.
try {
  process.loadEnvFile(".env.local")
} catch {
  /* CI provides the variables directly. */
}
const baseURL = process.env.APP_URL || "http://localhost:3000"
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL,
    headless: true,
    launchOptions: { channel: "chrome" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
})
