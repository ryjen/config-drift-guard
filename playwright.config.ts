import { defineConfig, devices } from "@playwright/test";

const webUrl = "http://127.0.0.1:3000";
const demoCaptureEnabled = process.env.CONFIG_DRIFT_GUARD_DEMO_CAPTURE === "1";

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
    // Recording is disabled unless explicitly opted in by an authorized internal PR.
    video: demoCaptureEnabled ? "on" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "corepack pnpm --filter @config-drift-guard/web start",
    url: webUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
