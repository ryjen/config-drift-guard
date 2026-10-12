export type ProgressConnectionState = "connecting" | "live" | "reconnecting" | "closed";

export interface ProgressEventSource {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

interface SubscriptionOptions {
  readonly apiBaseUrl: string;
  readonly runId: string;
  readonly onState: (state: ProgressConnectionState) => void;
  readonly onChange: (notification: unknown) => void;
  readonly onOpen: () => void;
  readonly onInvalidEvent: () => void;
  readonly createSource?: (url: string) => ProgressEventSource;
}

export function isTerminalRun(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "rejected";
}

export function subscribeToRunProgress(options: SubscriptionOptions): () => void {
  let closed = false;
  options.onState("connecting");
  const source = options.createSource?.(`${options.apiBaseUrl}/api/runs/${options.runId}/events`) ??
    new EventSource(`${options.apiBaseUrl}/api/runs/${options.runId}/events`);
  source.onopen = () => {
    if (closed) return;
    options.onState("live");
    options.onOpen();
  };
  source.onerror = () => {
    if (!closed) options.onState("reconnecting");
  };
  source.addEventListener("run-change", (message) => {
    if (closed) return;
    try {
      const notification: unknown = JSON.parse(message.data as string);
      if (
        typeof notification !== "object" ||
        notification === null ||
        !("runId" in notification) ||
        notification.runId !== options.runId
      ) return;
      options.onChange(notification);
    } catch {
      options.onInvalidEvent();
    }
  });
  return () => {
    if (closed) return;
    closed = true;
    source.close();
    options.onState("closed");
  };
}
