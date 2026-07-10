import {
  type JsonObject,
  type JsonValue,
  type NormalizedResourceState,
  SERVICE_CONFIG_MANAGED_FIELDS,
} from "@config-drift-guard/drift-engine";
import { z } from "zod";

const desiredServiceSchema = z.object({
  id: z.string().min(1),
  type: z.literal("service"),
  desired: z.object({
    image: z.string().min(1),
    replicas: z.number().int().nonnegative(),
    environment: z.record(z.string(), z.string()),
  }),
});

const canonicalSchema = z.object({
  resources: z.array(desiredServiceSchema).min(1),
});

const observedServiceSchema = z
  .object({
    type: z.literal("service"),
    image: z.string().min(1),
    replicas: z.number().int().nonnegative(),
    environment: z.record(z.string(), z.string()),
  })
  .passthrough();

const observedSchema = z.record(z.string(), observedServiceSchema);

export interface LoadedServiceConfigState {
  readonly canonicalRaw: JsonValue;
  readonly observedRaw: JsonValue;
}

const seededCanonical = {
  resources: [
    {
      id: "api-service",
      type: "service",
      desired: {
        image: "api:v2",
        replicas: 3,
        environment: {
          LOG_LEVEL: "info",
        },
      },
    },
  ],
} satisfies JsonValue;

const seededObserved = {
  "api-service": {
    type: "service",
    image: "api:v1",
    replicas: 1,
    environment: {
      LOG_LEVEL: "debug",
    },
    runtimePid: 1832,
    healthCheckedAt: "2026-07-10T00:00:00.000Z",
  },
} satisfies JsonValue;

export class ServiceConfigAdapter {
  readonly kind = "service_config" as const;

  loadCanonical(): JsonValue {
    return cloneJson(seededCanonical);
  }

  loadObserved(): JsonValue {
    return cloneJson(seededObserved);
  }

  validateCanonical(input: JsonValue): void {
    const parsed = canonicalSchema.parse(input);
    const ids = new Set<string>();
    for (const resource of parsed.resources) {
      if (ids.has(resource.id)) {
        throw new Error(`duplicate_resource_id:${resource.id}`);
      }
      ids.add(resource.id);
    }
  }

  normalizeCanonical(input: JsonValue): NormalizedResourceState {
    const parsed = canonicalSchema.parse(input);
    const resource = parsed.resources[0];
    if (resource === undefined) {
      throw new Error("canonical_resource_missing");
    }

    return {
      resourceId: resource.id,
      value: {
        image: resource.desired.image,
        replicas: resource.desired.replicas,
        environment: sortStringRecord(resource.desired.environment),
      },
      managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
    };
  }

  normalizeObserved(input: JsonValue, resourceId: string): NormalizedResourceState {
    const parsed = observedSchema.parse(input);
    const resource = parsed[resourceId];
    if (resource === undefined) {
      throw new Error(`observed_resource_missing:${resourceId}`);
    }

    return {
      resourceId,
      value: {
        image: resource.image,
        replicas: resource.replicas,
        environment: sortStringRecord(resource.environment),
      },
      managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
    };
  }
}

function sortStringRecord(input: Record<string, string>): JsonObject {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
