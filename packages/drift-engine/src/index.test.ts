import { describe, expect, it } from "vitest";
import {
  buildCompleteTargetState,
  canonicalStringify,
  compareNormalizedResourceStates,
  digestJson,
  digestNormalizedResourceState,
  getDriftEngineVersion,
  type JsonValue,
  type NormalizedResourceState,
  SERVICE_CONFIG_MANAGED_FIELDS,
} from "./index.js";

const serviceCanonical: NormalizedResourceState = {
  resourceId: "api-service",
  managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
  value: {
    image: "api:v2",
    replicas: 3,
    environment: {
      LOG_LEVEL: "info",
    },
  },
};

const serviceObserved: NormalizedResourceState = {
  resourceId: "api-service",
  managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
  value: {
    type: "service",
    image: "api:v1",
    replicas: 1,
    environment: {
      LOG_LEVEL: "debug",
    },
    runtimePid: 1832,
  },
};

describe("drift engine", () => {
  it("exposes a concrete deterministic engine version", () => {
    expect(getDriftEngineVersion()).toBe("0.1.0-drift-engine");
  });

  it("produces exactly the expected service configuration findings", () => {
    const result = compareNormalizedResourceStates(serviceCanonical, serviceObserved);

    expect(result.findings).toMatchObject([
      {
        resourceId: "api-service",
        path: "/image",
        kind: "changed",
        severity: "critical",
        canonicalValue: "api:v2",
        observedValue: "api:v1",
        sequence: 0,
      },
      {
        resourceId: "api-service",
        path: "/replicas",
        kind: "changed",
        severity: "warning",
        canonicalValue: 3,
        observedValue: 1,
        sequence: 1,
      },
      {
        resourceId: "api-service",
        path: "/environment/LOG_LEVEL",
        kind: "changed",
        severity: "warning",
        canonicalValue: "info",
        observedValue: "debug",
        sequence: 2,
      },
    ]);
    expect(result.findings.map((finding) => finding.path).sort()).toEqual([
      "/environment/LOG_LEVEL",
      "/image",
      "/replicas",
    ]);
    expect(result.hasDrift).toBe(true);
  });

  it("ignores unmanaged runtime metadata", () => {
    const result = compareNormalizedResourceStates(serviceCanonical, serviceObserved);

    expect(result.findings).not.toContainEqual(expect.objectContaining({ path: "/runtimePid" }));
    expect(result.findings).not.toContainEqual(expect.objectContaining({ path: "/type" }));
  });

  it("emits deterministic added, removed, and changed findings in stable path order", () => {
    const canonical: NormalizedResourceState = {
      resourceId: "res-1",
      managedFields: ["image", "settings"],
      value: {
        settings: {
          added: true,
          changed: "canonical",
          "slash/key": "canonical",
        },
        image: "app:v2",
      },
    };
    const observed: NormalizedResourceState = {
      resourceId: "res-1",
      managedFields: ["image", "settings"],
      value: {
        image: "app:v1",
        settings: {
          changed: "observed",
          removed: true,
          "slash/key": "observed",
        },
      },
    };

    const result = compareNormalizedResourceStates(canonical, observed, {
      severityForPath: (path) => (path === "/settings/removed" ? "critical" : "info"),
    });

    expect(result.findings).toMatchObject([
      { path: "/image", kind: "changed", severity: "info" },
      { path: "/settings/added", kind: "added", severity: "info" },
      { path: "/settings/changed", kind: "changed", severity: "info" },
      { path: "/settings/removed", kind: "removed", severity: "critical" },
      { path: "/settings/slash~1key", kind: "changed", severity: "info" },
    ]);
    expect(result.findings.map((finding) => finding.sequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses canonical SHA-256 digests that are stable across object key order", () => {
    const left = {
      z: false,
      a: {
        b: 1,
        a: 2,
      },
    } as const;
    const right = {
      a: {
        a: 2,
        b: 1,
      },
      z: false,
    } as const;

    expect(canonicalStringify(left)).toBe('{"a":{"a":2,"b":1},"z":false}');
    expect(digestJson(left)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digestJson(left)).toBe(digestJson(right));
  });

  it("digests only managed fields for normalized resource state", () => {
    const withUnmanaged: NormalizedResourceState = {
      resourceId: "api-service",
      managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
      value: {
        ...serviceObserved.value,
        runtimePid: 9999,
      },
    };

    expect(digestNormalizedResourceState(withUnmanaged)).toBe(
      digestNormalizedResourceState(serviceObserved),
    );
  });

  it("builds a complete target by replacing managed fields and preserving unmanaged fields", () => {
    const target = buildCompleteTargetState(serviceCanonical, serviceObserved);

    expect(target.expectedObservedDigest).toBe(digestNormalizedResourceState(serviceObserved));
    expect(target.target).toEqual({
      type: "service",
      image: "api:v2",
      replicas: 3,
      environment: {
        LOG_LEVEL: "info",
      },
      runtimePid: 1832,
    });
  });

  it("removes managed fields absent from canonical state when building a target", () => {
    const canonical: NormalizedResourceState = {
      resourceId: "api-service",
      managedFields: ["image", "replicas"],
      value: {
        image: "api:v2",
      },
    };
    const observed: NormalizedResourceState = {
      resourceId: "api-service",
      managedFields: ["image", "replicas"],
      value: {
        image: "api:v1",
        replicas: 2,
        runtimePid: 1832,
      },
    };

    expect(buildCompleteTargetState(canonical, observed).target).toEqual({
      image: "api:v2",
      runtimePid: 1832,
    });
  });

  it("does not mutate caller-owned input while comparing or building targets", () => {
    const canonical: NormalizedResourceState = {
      resourceId: "api-service",
      managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
      value: {
        image: "api:v2",
        replicas: 3,
        environment: {
          LOG_LEVEL: "info",
        },
      },
    };
    const observed: NormalizedResourceState = {
      resourceId: "api-service",
      managedFields: SERVICE_CONFIG_MANAGED_FIELDS,
      value: {
        image: "api:v1",
        replicas: 1,
        environment: {
          LOG_LEVEL: "debug",
        },
        runtimePid: 1832,
      },
    };
    const originalCanonical = canonicalStringify(canonical.value);
    const originalObserved = canonicalStringify(observed.value);

    const comparison = compareNormalizedResourceStates(canonical, observed);
    const target = buildCompleteTargetState(canonical, observed);
    const mutableTarget = target.target as Record<string, JsonValue>;
    mutableTarget.environment = { LOG_LEVEL: "mutated" };

    expect(canonicalStringify(canonical.value)).toBe(originalCanonical);
    expect(canonicalStringify(observed.value)).toBe(originalObserved);
    expect(
      comparison.findings.find((finding) => finding.path === "/environment/LOG_LEVEL")
        ?.canonicalValue,
    ).toBe("info");
  });

  it("rejects mismatched resource IDs", () => {
    expect(() =>
      compareNormalizedResourceStates(
        { ...serviceCanonical, resourceId: "canonical" },
        { ...serviceObserved, resourceId: "observed" },
      ),
    ).toThrow("different resources");
    expect(() =>
      buildCompleteTargetState(
        { ...serviceCanonical, resourceId: "canonical" },
        { ...serviceObserved, resourceId: "observed" },
      ),
    ).toThrow("different resources");
  });
});
