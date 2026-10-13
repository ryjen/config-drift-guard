import { mkdtempSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Event } from "@config-drift-guard/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { createDatabase } from "./persistence/database.js";
import { RunEventBus } from "./persistence/event-bus.js";

describe("SSE transport lifecycle", () => {
  it("replays persisted events, delivers live changes, and releases the subscription and heartbeat on client disconnect", async () => {
    const database = createDatabase(":memory:");
    const path = join(mkdtempSync(join(tmpdir(), "config-drift-sse-")), "observed.json");
    const app = await buildApp({ database, serviceConfigObservedPath: path });

    let subscribers = 0;
    let unsubscribes = 0;
    const originalSubscribe = RunEventBus.prototype.subscribe;
    const subscribeSpy = vi
      .spyOn(RunEventBus.prototype, "subscribe")
      .mockImplementation(function (
        this: RunEventBus,
        runId: string,
        listener: (event: Event) => void,
      ) {
        const stop = originalSubscribe.call(this, runId, listener);
        subscribers += 1;
        return () => {
          unsubscribes += 1;
          subscribers -= 1;
          stop();
        };
      });
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    let stream: ReturnType<typeof get> | undefined;
    let response: import("node:http").IncomingMessage | undefined;

    try {
      const create = await app.inject({
        method: "POST",
        url: "/api/environments/env_service_config/runs",
      });
      expect(create.statusCode).toBe(201);
      const runId = (create.json() as { run: { id: string } }).run.id;

      await expect
        .poll(async () => {
          const snapshot = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
          return (snapshot.json() as { run: { status: string } }).run.status;
        })
        .toBe("awaiting_approval");

      const snapshot = (await app.inject({ method: "GET", url: `/api/runs/${runId}` })).json() as {
        events: Array<{ id: number }>;
      };
      expect(snapshot.events.length).toBeGreaterThan(1);
      const penultimate = snapshot.events.at(-2);
      const latest = snapshot.events.at(-1);
      expect(penultimate).toBeDefined();
      expect(latest).toBeDefined();

      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const source = openStream(`${address}/api/runs/${runId}/events`, String(penultimate?.id));
      stream = source.request;
      response = await source.response;

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      const seen: string[] = [];
      response.on("data", (chunk: Buffer) => seen.push(chunk.toString("utf8")));

      await expect.poll(() => seen.join("").includes(`id: ${latest?.id}\n`)).toBe(true);
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(subscribers).toBe(1);
      expect(unsubscribes).toBe(0);

      const reject = await app.inject({
        method: "POST",
        url: `/api/runs/${runId}/reject`,
        payload: {},
      });
      expect(reject.statusCode).toBe(200);
      await expect.poll(() => seen.join("").includes("decision.rejected")).toBe(true);

      response.destroy();
      stream.destroy();
      await expect.poll(() => subscribers).toBe(0);
      expect(unsubscribes).toBe(1);
      const timerIndex = intervalSpy.mock.calls.findIndex(([, delay]) => delay === 15_000);
      expect(timerIndex).toBeGreaterThanOrEqual(0);
      const timer = intervalSpy.mock.results[timerIndex]?.value;
      expect(timer).toBeDefined();
      expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    } finally {
      response?.destroy();
      stream?.destroy();
      subscribeSpy.mockRestore();
      intervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      await app.close();
      database.close();
    }
  });
});

function openStream(url: string, lastEventId: string) {
  const request = get(url, { headers: { "Last-Event-ID": lastEventId } });
  const response = new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    request.once("response", resolve);
    request.once("error", reject);
  });
  return { request, response };
}
