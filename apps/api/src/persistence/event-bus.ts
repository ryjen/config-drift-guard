import type { Event } from "@config-drift-guard/contracts";

export type RunEventListener = (event: Event) => void;

/** In-memory fan-out only. Durable events and replay remain in persistence. */
export class RunEventBus {
  private readonly listeners = new Map<string, Set<RunEventListener>>();

  subscribe(runId: string, listener: RunEventListener): () => void {
    let listeners = this.listeners.get(runId);
    if (listeners === undefined) {
      listeners = new Set<RunEventListener>();
      this.listeners.set(runId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(runId);
    };
  }

  publish(event: Event): void {
    const listeners = this.listeners.get(event.runId);
    if (listeners === undefined) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A broken HTTP client must never abort persisted state transitions.
      }
    }
  }
}
