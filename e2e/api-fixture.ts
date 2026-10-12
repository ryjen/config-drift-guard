import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";

// The web server is suite-scoped, but each test receives an independent API process
// and in-memory database. Failed/aborted tests cannot poison later cases.
export const test = base.extend<{ apiServer: undefined }>({
  apiServer: [
    async ({ browserName: _browserName }, use) => {
      const child = spawn(process.execPath, [resolve("e2e/api-child.mjs")], {
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
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      const ready = new Promise<void>((resolveReady, rejectReady) => {
        const timeout = setTimeout(() => {
          cleanup();
          rejectReady(new Error("E2E API IPC readiness timeout"));
        }, 15_000);
        const cleanup = () => {
          clearTimeout(timeout);
          child.off("message", onMessage);
          child.off("error", onError);
          child.off("exit", onExit);
        };
        const onMessage = (message: unknown) => {
          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "ready"
          ) {
            cleanup();
            resolveReady();
          }
        };
        const onError = (error: Error) => {
          cleanup();
          rejectReady(error);
        };
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
          cleanup();
          rejectReady(new Error(`E2E API exited before binding (code=${code}, signal=${signal})`));
        };
        child.on("message", onMessage);
        child.once("error", onError);
        child.once("exit", onExit);
      });

      try {
        // Do not trust an HTTP 200 from some other service on port 4000.
        await ready;
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
