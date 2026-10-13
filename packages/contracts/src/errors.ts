/** A persisted remediation plan no longer matches observed managed state. */
export class StaleRemediationPlanError extends Error {
  constructor(
    readonly expectedObservedDigest: string,
    readonly currentObservedDigest: string,
  ) {
    super("stale_remediation_plan");
  }
}
