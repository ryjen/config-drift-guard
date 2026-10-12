import { defineConfig, devices } from "@playwright/test";

const webUrl = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "corepack pnpm --filter @config-drift-guard/web start",
    url: webUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
