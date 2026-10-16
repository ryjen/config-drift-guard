import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";

const apiUrl = "http://127.0.0.1:4000";
const demoCaptureEnabled = process.env.CONFIG_DRIFT_GUARD_DEMO_CAPTURE === "1";
const ordinaryDelay = { queueMs: "200", phaseMs: "60" } as const;
const recordedDelay = { queueMs: "500", phaseMs: "650" } as const;
const selectedDelay = demoCaptureEnabled ? recordedDelay : ordinaryDelay;

async function waitForOwnApi(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolveReady, rejectReady) => {
    let settled = false;
    let output = "";
    const timeout = setTimeout(() => {
      finish(new Error("E2E API process did not bind within 15 seconds"));
    }, 15_000);

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) rejectReady(error);
      else resolveReady();
    }

    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      finish(new Error(`E2E API exited before listening (code ${code}, signal ${signal})`));
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-4096);
      if (output.includes("Server listening at http://127.0.0.1:4000")) {
        finish();
      }
    });
  });
}

// Next.js is suite-scoped; each test runs an independent API process and DB.
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
          QUEUE_DELAY_MS: selectedDelay.queueMs,
          PHASE_DELAY_MS: selectedDelay.phaseMs,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Drain error output to avoid a blocked child; do not echo secrets.
      child.stderr?.on("data", () => undefined);
      try {
        // Unlike a generic health request, this verifies that OUR child bound.
        await waitForOwnApi(child);
        const response = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) throw new Error(`E2E API health failed: ${response.status}`);
        await use(undefined);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          await new Promise<void>((resolveExit, rejectExit) => {
            // Do not release the shared API port until this child has exited.
            // Sending SIGKILL is not proof that the process has terminated.
            const escalation = setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                child.kill("SIGKILL");
              }
            }, 3_000);
            const deadline = setTimeout(() => {
              cleanup();
              rejectExit(
                new Error("E2E API did not exit after SIGKILL; port isolation unverified"),
              );
            }, 7_000);

            function cleanup(): void {
              clearTimeout(escalation);
              clearTimeout(deadline);
              child.removeListener("exit", onExit);
              child.removeListener("error", onError);
            }

            function onExit(): void {
              cleanup();
              resolveExit();
            }

            function onError(error: Error): void {
              cleanup();
              rejectExit(error);
            }

            child.once("exit", onExit);
            child.once("error", onError);
            if (!child.kill("SIGTERM")) {
              cleanup();
              rejectExit(new Error("Unable to signal E2E API for teardown"));
            }
          });
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
