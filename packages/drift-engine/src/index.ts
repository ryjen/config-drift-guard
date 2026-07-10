import { createHash } from "node:crypto";

export const DRIFT_ENGINE_VERSION = "0.1.0-drift-engine";

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type DriftFindingKind = "added" | "removed" | "changed";
export type DriftFindingSeverity = "info" | "warning" | "critical";

export interface NormalizedResourceState {
  readonly resourceId: string;
  readonly value: JsonObject;
  readonly managedFields: readonly string[];
}

export interface DriftFinding {
  readonly resourceId: string;
  readonly path: string;
  readonly kind: DriftFindingKind;
  readonly severity: DriftFindingSeverity;
  readonly canonicalValue: JsonValue | null;
  readonly observedValue: JsonValue | null;
  readonly sequence: number;
}

export interface CompareOptions {
  readonly severityForPath?: (path: string, kind: DriftFindingKind) => DriftFindingSeverity;
}

export interface DriftComparisonResult {
  readonly resourceId: string;
  readonly canonicalDigest: string;
  readonly observedDigest: string;
  readonly findings: readonly DriftFinding[];
  readonly hasDrift: boolean;
  readonly engineVersion: string;
}

export interface RemediationTarget {
  readonly resourceId: string;
  readonly expectedObservedDigest: string;
  readonly target: JsonObject;
  readonly targetDigest: string;
  readonly engineVersion: string;
}

export const SERVICE_CONFIG_MANAGED_FIELDS = ["image", "replicas", "environment"] as const;

export function getDriftEngineVersion(): string {
  return DRIFT_ENGINE_VERSION;
}

export function compareNormalizedResourceStates(
  canonical: NormalizedResourceState,
  observed: NormalizedResourceState,
  options: CompareOptions = {},
): DriftComparisonResult {
  if (canonical.resourceId !== observed.resourceId) {
    throw new Error("Cannot compare normalized states for different resources");
  }

  const managedFields = getManagedFields(canonical, observed);
  const canonicalManagedState = selectManagedFields(canonical.value, managedFields);
  const observedManagedState = selectManagedFields(observed.value, managedFields);
  const rawFindings = compareManagedFields(
    canonical.resourceId,
    canonical.value,
    observed.value,
    managedFields,
  );
  const severityForPath = options.severityForPath ?? defaultSeverityForPath;
  const findings = rawFindings.map((finding, sequence) => ({
    ...finding,
    sequence,
    severity: severityForPath(finding.path, finding.kind),
  }));

  return {
    resourceId: canonical.resourceId,
    canonicalDigest: digestJson(canonicalManagedState),
    observedDigest: digestJson(observedManagedState),
    findings,
    hasDrift: findings.length > 0,
    engineVersion: DRIFT_ENGINE_VERSION,
  };
}

export function buildCompleteTargetState(
  canonical: NormalizedResourceState,
  observed: NormalizedResourceState,
): RemediationTarget {
  if (canonical.resourceId !== observed.resourceId) {
    throw new Error("Cannot build a target for different resources");
  }

  const managedFields = getManagedFields(canonical, observed);
  const target: Record<string, JsonValue> = cloneJsonObject(observed.value);

  for (const field of managedFields) {
    if (Object.hasOwn(canonical.value, field)) {
      target[field] = cloneJsonValue(canonical.value[field] ?? null);
    } else {
      delete target[field];
    }
  }

  return {
    resourceId: canonical.resourceId,
    expectedObservedDigest: digestJson(selectManagedFields(observed.value, managedFields)),
    target,
    targetDigest: digestJson(target),
    engineVersion: DRIFT_ENGINE_VERSION,
  };
}

export function digestNormalizedResourceState(state: NormalizedResourceState): string {
  return digestJson(selectManagedFields(state.value, sortedUnique(state.managedFields)));
}

export function digestJson(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalStringify(value)).digest("hex")}`;
}

export function canonicalStringify(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`)
    .join(",")}}`;
}

function compareValues(
  resourceId: string,
  canonical: JsonValue,
  observed: JsonValue,
  path = "",
): readonly Omit<DriftFinding, "severity" | "sequence">[] {
  if (isJsonObject(canonical) && isJsonObject(observed)) {
    const findings: Omit<DriftFinding, "severity" | "sequence">[] = [];
    const keys = sortedUnique([...Object.keys(canonical), ...Object.keys(observed)]);

    for (const key of keys) {
      const childPath = `${path}/${escapePointerSegment(key)}`;
      const canonicalHasKey = Object.hasOwn(canonical, key);
      const observedHasKey = Object.hasOwn(observed, key);

      if (canonicalHasKey && !observedHasKey) {
        findings.push({
          resourceId,
          path: childPath,
          kind: "added",
          canonicalValue: cloneJsonValue(canonical[key] ?? null),
          observedValue: null,
        });
        continue;
      }

      if (!canonicalHasKey && observedHasKey) {
        findings.push({
          resourceId,
          path: childPath,
          kind: "removed",
          canonicalValue: null,
          observedValue: cloneJsonValue(observed[key] ?? null),
        });
        continue;
      }

      findings.push(
        ...compareValues(resourceId, canonical[key] ?? null, observed[key] ?? null, childPath),
      );
    }

    return findings;
  }

  if (canonicalStringify(canonical) === canonicalStringify(observed)) {
    return [];
  }

  return [
    {
      resourceId,
      path: path || "/",
      kind: "changed",
      canonicalValue: cloneJsonValue(canonical),
      observedValue: cloneJsonValue(observed),
    },
  ];
}

function compareManagedFields(
  resourceId: string,
  canonical: JsonObject,
  observed: JsonObject,
  managedFields: readonly string[],
): readonly Omit<DriftFinding, "severity" | "sequence">[] {
  const findings: Omit<DriftFinding, "severity" | "sequence">[] = [];

  for (const field of managedFields) {
    const path = `/${escapePointerSegment(field)}`;
    const canonicalHasField = Object.hasOwn(canonical, field);
    const observedHasField = Object.hasOwn(observed, field);

    if (canonicalHasField && !observedHasField) {
      findings.push({
        resourceId,
        path,
        kind: "added",
        canonicalValue: cloneJsonValue(canonical[field] ?? null),
        observedValue: null,
      });
      continue;
    }

    if (!canonicalHasField && observedHasField) {
      findings.push({
        resourceId,
        path,
        kind: "removed",
        canonicalValue: null,
        observedValue: cloneJsonValue(observed[field] ?? null),
      });
      continue;
    }

    if (canonicalHasField && observedHasField) {
      findings.push(
        ...compareValues(resourceId, canonical[field] ?? null, observed[field] ?? null, path),
      );
    }
  }

  return findings;
}

function getManagedFields(
  canonical: NormalizedResourceState,
  observed: NormalizedResourceState,
): readonly string[] {
  return orderedUnique([...canonical.managedFields, ...observed.managedFields]);
}

function selectManagedFields(value: JsonObject, managedFields: readonly string[]): JsonObject {
  const selected: Record<string, JsonValue> = {};

  for (const field of sortedUnique(managedFields)) {
    if (Object.hasOwn(value, field)) {
      selected[field] = cloneJsonValue(value[field] ?? null);
    }
  }

  return selected;
}

function defaultSeverityForPath(path: string, _kind: DriftFindingKind): DriftFindingSeverity {
  if (path === "/image") {
    return "critical";
  }

  if (path === "/replicas" || path.startsWith("/environment/")) {
    return "warning";
  }

  return "info";
}

function cloneJsonObject(value: JsonObject): Record<string, JsonValue> {
  return cloneJsonValue(value) as Record<string, JsonValue>;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  const objectValue = value as JsonObject;
  const clone: Record<string, JsonValue> = {};
  for (const key of Object.keys(objectValue)) {
    clone[key] = cloneJsonValue(objectValue[key] ?? null);
  }
  return clone;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function orderedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
