import { afterEach, describe, expect, it, vi } from "vitest";
import { demoRuntimeFromEnvironment } from "./runtime.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("explicit demo runtime", () => {
  it("does not configure pacing or deferred scheduling without DEMO_MODE=1", () => {
    expect(demoRuntimeFromEnvironment({})).toEqual({});
    expect(
      demoRuntimeFromEnvironment({ QUEUE_DELAY_MS: "999", PHASE_DELAY_MS: "999" }),
    ).toEqual({});
  });

  it("delays only explicitly enabled demo tasks and phases", async () => {
    vi.useFakeTimers();
    const runtime = demoRuntimeFromEnvironment({
      DEMO_MODE: "1",
      QUEUE_DELAY_MS: "2000",
      PHASE_DELAY_MS: "500",
    });
    if (!runtime.deferWorkflow || !runtime.workflowPacer) {
      throw new Error("Demo composition did not provide scheduling and pacing");
    }

    const task = vi.fn();
    runtime.deferWorkflow(task);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledOnce();

    const finished = vi.fn();
    const phase = runtime.workflowPacer.afterPhase().then(finished);
    await vi.advanceTimersByTimeAsync(499);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await phase;
    expect(finished).toHaveBeenCalledOnce();
  });

  it("rejects invalid or excessive delays only when demo is enabled", () => {
    expect(() =>
      demoRuntimeFromEnvironment({ DEMO_MODE: "1", QUEUE_DELAY_MS: "-1" }),
    ).toThrow("QUEUE_DELAY_MS");
    expect(() =>
      demoRuntimeFromEnvironment({ DEMO_MODE: "1", PHASE_DELAY_MS: "60001" }),
    ).toThrow("PHASE_DELAY_MS");
  });
});
