import { type Event, type EventRepository, eventSchema, type JsonValue } from "@config-drift-guard/contracts";
import { and, asc, eq, gt } from "drizzle-orm";
import type { RunEventBusPort } from "../application/ports.js";
import type { AppDatabase } from "./database.js";
import { events, runs } from "./schema.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function parseEvent(row: typeof events.$inferSelect): Event {
  return eventSchema.parse(row);
}

/** Owns persisted event ordering/replay; publishes after the existing write. */
export class SqliteEventRepository implements EventRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly eventBus: RunEventBusPort,
  ) {}

  listRunEventsAfter(runId: string, afterEventId: number): Event[] {
    const existing = this.db.select({ id: runs.id }).from(runs).where(eq(runs.id, runId)).limit(1).all()[0];
    if (existing === undefined) throw new Error(`run_not_found:${runId}`);
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.runId, runId), gt(events.id, afterEventId)))
      .orderBy(asc(events.id))
      .all()
      .map(parseEvent);
  }

  appendEvent(runId: string, eventType: string, payload: JsonValue): Event {
    this.db.insert(events).values({ runId, eventType, payload, createdAt: nowIso() }).run();
    const [row] = this.db
      .select()
      .from(events)
      .where(eq(events.runId, runId))
      .orderBy(asc(events.id))
      .all()
      .slice(-1);
    if (row === undefined) {
      throw new Error("event_not_saved");
    }
    const event = parseEvent(row);
    this.eventBus.publish(event);
    return event;
  }
}
