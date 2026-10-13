import { eventSchema } from "@config-drift-guard/contracts";
import { describe, expect, it, vi } from "vitest";
import { RunEventBus } from "./event-bus.js";

function event(runId: string, id: number) {
  return eventSchema.parse({
    id,
    runId,
    eventType: "test.created",
    payload: { id },
    createdAt: new Date().toISOString(),
  });
}

describe("RunEventBus", () => {
  it("fans out by run identity and supports idempotent unsubscribe", () => {
    const bus = new RunEventBus();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = bus.subscribe("run_a", first);
    const stopSecond = bus.subscribe("run_b", second);

    const a = event("run_a", 1);
    bus.publish(a);
    expect(first).toHaveBeenCalledExactlyOnceWith(a);
    expect(second).not.toHaveBeenCalled();

    stopFirst();
    stopFirst();
    bus.publish(event("run_a", 2));
    expect(first).toHaveBeenCalledTimes(1);

    const b = event("run_b", 3);
    bus.publish(b);
    expect(second).toHaveBeenCalledExactlyOnceWith(b);
    stopSecond();
  });

  it("quarantines subscriber errors without blocking other listeners", () => {
    const bus = new RunEventBus();
    const next = vi.fn();
    bus.subscribe("run_a", () => {
      throw new Error("client disconnected");
    });
    bus.subscribe("run_a", next);
    const change = event("run_a", 4);

    expect(() => bus.publish(change)).not.toThrow();
    expect(next).toHaveBeenCalledExactlyOnceWith(change);
  });
});
