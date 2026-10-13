import type { BuildAppOptions } from "../app.js";

type RuntimeOptions = Pick<BuildAppOptions, "deferWorkflow" | "workflowPacer">;

function delayMs(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 60_000) {
    throw new Error(`${name} must not exceed 60000 milliseconds`);
  }
  return parsed;
}

/** Explicit demonstration-only composition, never used by buildApp by default. */
export function demoRuntimeFromEnvironment(env: NodeJS.ProcessEnv): RuntimeOptions {
  if (env.DEMO_MODE !== "1") return {};

  const queueDelay = delayMs(env.QUEUE_DELAY_MS, "QUEUE_DELAY_MS", 2_000);
  const phaseDelay = delayMs(env.PHASE_DELAY_MS, "PHASE_DELAY_MS", 500);

  return {
    deferWorkflow: (callback) => setTimeout(callback, queueDelay),
    workflowPacer: {
      afterPhase: () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, phaseDelay);
        }),
    },
  };
}
