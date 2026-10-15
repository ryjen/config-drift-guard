import type { DriftAdapter } from "../application/ports.js";

/** A port-typed test double: selected behavior is overridden, never inherited. */
export function withAdapterOverrides(
  base: DriftAdapter,
  overrides: Partial<Pick<DriftAdapter, "loadCanonical" | "applyTarget">>,
): DriftAdapter {
  return {
    kind: base.kind,
    loadCanonical: overrides.loadCanonical ?? (() => base.loadCanonical()),
    loadObserved: () => base.loadObserved(),
    validateCanonical: (input) => base.validateCanonical(input),
    normalizeCanonical: (input) => base.normalizeCanonical(input),
    normalizeObserved: (input, resourceId) => base.normalizeObserved(input, resourceId),
    applyTarget:
      overrides.applyTarget ??
      ((expectedObservedDigest, target) => base.applyTarget(expectedObservedDigest, target)),
  };
}
