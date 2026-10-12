import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";

const apiUrl = "http://127.0.0.1:4000";

// The web server is suite-scoped, but each test receives an independent API process
// and in-memory database. Failed/aborted tests cannot poison later cases.
export const test = base.extend<{ apiServer: undefined }>({
  apiServer: [
    async ({ browserName: _browserName }, use) => {
      const child = spawn(process.execPath, [resolve("apps/api/dist/server.js")], {
        cwd: resolve("apps/api"),
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "4000",
          CONFIG_DRIFT_GUARD_DB: ":memory:",
          CONFIG_DRIFT_GUARD_OBSERVED_STATE: "data/e2e-service.observed.json",
          QUEUE_DELAY_MS: "200",
          PHASE_DELAY_MS: "60",
        },
        stdio: "ignore",
      });
      let spawnError: Error | null = null;
      child.on("error", (error) => {
        spawnError = error;
      });

      try {
        const deadline = Date.now() + 15_000;
        while (true) {
          if (spawnError !== null) throw spawnError;
          if (child.exitCode !== null || child.signalCode !== null) {
            throw new Error("E2E API exited before becoming healthy");
          }
          try {
            const response = await fetch(`${apiUrl}/health`, {
              signal: AbortSignal.timeout(500),
            });
            if (response.ok) break;
          } catch {
            // Initial connection refusal is expected while the API starts.
          }
          if (Date.now() >= deadline) throw new Error("E2E API health timeout");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await use(undefined);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 3_000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
            child.kill("SIGTERM");
          });
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
