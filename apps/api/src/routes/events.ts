import type { Event } from "@config-drift-guard/contracts";
import type { FastifyInstance } from "fastify";
import { apiError } from "../api-error.js";
import type { EventReadRepository, RunEventBusPort } from "../application/ports.js";

export function registerEventRoutes(
  app: FastifyInstance,
  repository: EventReadRepository,
  eventBus: RunEventBusPort,
): void {
  app.get<{ Params: { runId: string } }>("/api/runs/:runId/events", async (request, reply) => {
    let lastSentEventId = parseLastEventId(request.headers["last-event-id"]);

    try {
      repository.getRun(request.params.runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("run_not_found:")) {
        reply.code(404);
        return apiError("run_not_found", "Run not found", request.id);
      }

      throw error;
    }

    reply.hijack();
    const requestOrigin = request.headers.origin;
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
      "X-Request-Id": request.id,
      ...(requestOrigin !== undefined ? { "Access-Control-Allow-Origin": requestOrigin } : {}),
    });

    let unsubscribe = (): void => undefined;
    const writeEvent = (event: Event): void => {
      if (event.id <= lastSentEventId || reply.raw.destroyed) {
        return;
      }

      lastSentEventId = event.id;
      try {
        reply.raw.write(formatRunChangeEvent(event, repository.getRun(event.runId).version));
      } catch {
        unsubscribe();
        reply.raw.destroy();
      }
    };

    unsubscribe = eventBus.subscribe(request.params.runId, writeEvent);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(":heartbeat\n\n");
      }
    }, 15_000);
    reply.raw.once("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    for (const event of repository.listRunEventsAfter(request.params.runId, lastSentEventId)) {
      writeEvent(event);
    }
  });
}

function parseLastEventId(value: string | string[] | undefined): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (rawValue === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function formatRunChangeEvent(event: Event, version: number): string {
  const data = JSON.stringify({
    runId: event.runId,
    version,
    eventId: event.id,
    eventType: event.eventType,
  });

  return `id: ${event.id}\nevent: run-change\ndata: ${data}\n\n`;
}
