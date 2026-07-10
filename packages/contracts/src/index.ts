import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const healthResponseSchema = z.object({
  service: z.literal("config-drift-guard-api"),
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const healthResponse: HealthResponse = {
  service: "config-drift-guard-api",
  status: "ok",
};

export const adapterKindSchema = z.enum(["service_config", "documentation"]);
export type AdapterKind = z.infer<typeof adapterKindSchema>;

export const environmentSourceConfigSchema = z.object({
  scenario: z.string().min(1),
  canonicalFixture: z.string().min(1),
  observedFixture: z.string().min(1),
});
export type EnvironmentSourceConfig = z.infer<typeof environmentSourceConfigSchema>;

export const environmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapterKind: adapterKindSchema,
  sourceConfig: environmentSourceConfigSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Environment = z.infer<typeof environmentSchema>;

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "rejected",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const stepStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "skipped"]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const workflowStepKeySchema = z.enum([
  "validate_canonical_state",
  "load_observed_state",
  "normalize_state",
  "calculate_drift",
  "classify_findings",
  "build_remediation_plan",
  "preflight_reconciliation",
  "apply_reconciliation",
  "verify_convergence",
]);
export type WorkflowStepKey = z.infer<typeof workflowStepKeySchema>;

export const errorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: jsonValueSchema.optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const runSchema = z.object({
  id: z.string().min(1),
  environmentId: z.string().min(1),
  status: runStatusSchema,
  currentStep: workflowStepKeySchema.nullable(),
  version: z.number().int().nonnegative(),
  canonicalDigest: z.string().min(1).nullable(),
  observedDigest: z.string().min(1).nullable(),
  findingCount: z.number().int().nonnegative(),
  error: errorEnvelopeSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Run = z.infer<typeof runSchema>;

export const stepSchema = z.object({
  runId: z.string().min(1),
  key: workflowStepKeySchema,
  sequence: z.number().int().nonnegative(),
  status: stepStatusSchema,
  message: z.string().nullable(),
  output: jsonValueSchema.nullable(),
  error: errorEnvelopeSchema.nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type Step = z.infer<typeof stepSchema>;

export const findingKindSchema = z.enum(["missing", "extra", "changed"]);
export type FindingKind = z.infer<typeof findingKindSchema>;

export const findingSeveritySchema = z.enum(["info", "warning", "critical"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  resourceId: z.string().min(1),
  path: z.string().min(1),
  kind: findingKindSchema,
  severity: findingSeveritySchema,
  canonicalValue: jsonValueSchema.nullable(),
  observedValue: jsonValueSchema.nullable(),
  sequence: z.number().int().nonnegative(),
});
export type Finding = z.infer<typeof findingSchema>;

export const remediationPlanSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  canonicalDigest: z.string().min(1),
  expectedObservedDigest: z.string().min(1),
  target: jsonValueSchema,
  engineVersion: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type RemediationPlan = z.infer<typeof remediationPlanSchema>;

export const decisionActionSchema = z.enum(["approved", "rejected"]);
export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const decisionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  action: decisionActionSchema,
  actor: z.string().min(1),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const eventSchema = z.object({
  id: z.number().int().positive(),
  runId: z.string().min(1),
  eventType: z.string().min(1),
  payload: jsonValueSchema,
  createdAt: z.string().datetime(),
});
export type Event = z.infer<typeof eventSchema>;

export const runSnapshotSchema = z.object({
  run: runSchema,
  steps: z.array(stepSchema),
  findings: z.array(findingSchema),
  plan: remediationPlanSchema.nullable(),
  decision: decisionSchema.nullable(),
  events: z.array(eventSchema),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;
