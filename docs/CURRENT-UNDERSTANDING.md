# Current Understanding

## Product

**Config Drift Guard** is a small internal-platform control plane that detects divergence between canonical desired state and observed or derived state.

The system models drift analysis as an explicit, persisted workflow:

```text
load canonical state
→ load observed state
→ validate
→ normalize
→ compare
→ classify findings
→ generate immutable remediation plan
→ operator decision
→ reconcile
→ verify
```

The primary implementation is deterministic. AI is required and documented as part of the engineering process, but it is not authoritative over infrastructure truth or mutation.

## Assessment interpretation

The goal is an **evaluator-ready vertical slice**, not exhaustive completion of every possible architecture feature.

The submission should demonstrate:

- a real platform-engineering problem;
- declarative desired state and observed state;
- reconciliation and resource lifecycle reasoning;
- persisted workflow and step state;
- clear operator visibility;
- well-designed APIs;
- failure handling;
- pragmatic local development;
- meaningful use of AI during planning, implementation, review, and correction.

The project does not need to be an AI product. For this problem, deterministic comparison is a stronger engineering choice than delegating correctness to an LLM.

## Core product principles

### 1. Canonical source versus derived state

One representation is authoritative.

Examples:

```text
desired service configuration → observed runtime configuration
configuration schema          → documentation reference table
OpenAPI specification         → generated API documentation
RFC metadata                  → documentation index
```

Derived state may be regenerated or validated, but it must not silently become a competing source of truth.

### 2. Deterministic authority

The authoritative path uses:

- schemas;
- normalization;
- explicit comparison;
- deterministic policy;
- immutable plans;
- enforced transitions;
- verification.

AI may be used later as an advisory explainer, but it does not determine whether drift exists and does not authorize or execute remediation.

### 3. Evidence-backed decisions

Each run records the evidence on which findings and decisions were based:

- canonical-state digest;
- observed-state digest;
- normalized representations;
- drift findings;
- generated plan;
- operator decision;
- post-reconciliation verification.

### 4. Approval is a real control boundary

The UI cannot submit arbitrary mutations.

The backend generates a remediation plan from validated state. The operator may approve or reject that plan. Approval is persisted and enforced by the run state machine.

### 5. Stale plans must fail safely

A plan records the observed-state digest used during analysis. Before mutation, the adapter re-reads observed state.

```text
current digest == planned digest
```

If the values differ, the run fails with `stale_remediation_plan`. The system must not overwrite state that changed after the operator reviewed the plan.

### 6. Reconciliation requires verification

A successful write is not a successful run.

After applying the target state, the system runs detection again. The run succeeds only when the expected drift has been eliminated.

## Drift domains

The architecture supports adapters. The initial implementation should remain narrow.

### Primary adapter: service configuration drift

Canonical input:

- In-memory seeded JavaScript object (structural equivalent of YAML desired state).

Observed input:

- JSON runtime state.

Managed fields:

- image;
- replicas;
- environment variables.

Unmanaged runtime metadata must be ignored.

### Secondary adapter or scenario: documentation drift

Canonical input:

- a structured configuration schema.

Observed/derived input:

- a managed Markdown table or generated documentation section.

Example findings:

```text
timeout
  missing from documentation

retries.default
  schema: 3
  documentation: 5
```

Documentation drift should compare structured content only:

- tables;
- frontmatter;
- generated blocks;
- schemas;
- indexes;
- fenced configuration examples.

Arbitrary prose similarity is not authoritative and should remain out of scope.

## Anthesis and Meristem influences

The project borrows selected principles without importing a generalized governance framework.

| Borrowed concept | Application |
|---|---|
| Canonical source | Desired configuration or schema |
| Derived artifact | Runtime state or documentation |
| Check/write modes | Detect versus reconcile |
| Evidence | Digests, findings, plan, verification |
| Provenance | Engine version and source digests |
| Approval | Enforced run transition |
| Scoped policy | Compare only fields owned by the adapter |
| Validation before mutation | Parse, validate, build target, validate, write |
| Verification | Re-scan after mutation |

The project intentionally does not borrow:

- actor registries;
- capability tokens;
- policy DSLs;
- multi-agent orchestration;
- MCP governance;
- cryptographic evidence envelopes;
- vector stores;
- autonomous remediation.

## AI usage

AI is part of the development workflow:

- requirements analysis;
- architectural alternatives;
- planning;
- implementation prompts;
- code review;
- threat modeling;
- test-case generation;
- adversarial review;
- documentation reconciliation.

The repository must preserve the complete interaction log and identify:

- decisions made by the author;
- suggestions accepted;
- suggestions rejected;
- corrections requested;
- verification performed.

An optional future AI feature could explain findings or suggest investigation steps, but it is not required for the assessment and must remain advisory.

## Product scope

### Required (all implemented)

- Next.js operator UI;
- TypeScript API;
- SQLite persistence;
- deterministic drift engine;
- explicit run state machine;
- one primary service-config scenario;
- documentation-drift adapter;
- step-level progress;
- REST run snapshot;
- minimal SSE;
- findings and immutable remediation plan;
- approval and rejection;
- safe reconciliation;
- verification;
- failure scenarios;
- tests;
- README, architecture, trade-off, and demo docs;
- meaningful commit history;
- complete AI interaction log.

### Deliberately omitted

- real cloud credentials;
- Terraform or Kubernetes execution;
- authentication and multi-tenancy;
- generic workflow engine;
- autonomous AI remediation;
- complex policy language;
- distributed workers;
- production rollback framework;
- arbitrary filesystem paths from the browser.

## Success definition

A fresh evaluator can:

1. install dependencies;
2. initialize local state;
3. start the application;
4. select a scenario;
5. run drift detection;
6. observe persisted workflow steps;
7. inspect evidence and findings;
8. review and approve or reject a generated plan;
9. observe reconciliation;
10. see verification succeed or a clear failure;
11. review the implementation decisions and AI interaction history.
