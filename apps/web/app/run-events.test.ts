import { describe, expect, it, vi } from "vitest";
import { isTerminalRun, subscribeToRunProgress, type ProgressEventSource } from "./run-events";

class FakeSource implements ProgressEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, (event: MessageEvent) => void>();
  readonly close = vi.fn();

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  send(value: unknown): void {
    this.listeners.get("run-change")?.({ data: JSON.stringify(value) } as MessageEvent);
  }
}

describe("SSE progress lifecycle", () => {
  it("classifies terminal runs and leaves approval pending as active", () => {
    expect(["succeeded", "failed", "rejected"].every(isTerminalRun)).toBe(true);
    expect(["queued", "running", "awaiting_approval"].some(isTerminalRun)).toBe(false);
  });

  it("refreshes authoritative state on initial open and reconnect, then closes idempotently", () => {
    const source = new FakeSource();
    const states: string[] = [];
    const onOpen = vi.fn();
    const onChange = vi.fn();
    const stop = subscribeToRunProgress({
      apiBaseUrl: "http://localhost:4000",
      runId: "run_1",
      onState: (state) => states.push(state),
      onOpen,
      onChange,
      onInvalidEvent: vi.fn(),
      createSource: (url) => {
        expect(url).toBe("http://localhost:4000/api/runs/run_1/events");
        return source;
      },
    });

    source.onopen?.();
    source.onerror?.();
    source.onopen?.();
    source.send({ runId: "other", version: 1 });
    source.send({ runId: "run_1", version: 2 });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["connecting", "live", "reconnecting", "live"]);

    stop();
    stop();
    source.send({ runId: "run_1", version: 3 });
    source.onopen?.();
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("closed");
  });
});
