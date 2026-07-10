# Architectural Decisions

## ADR-001 — Build an evaluator-ready vertical slice

**Status:** Accepted

The target is a complete vertical slice within the planned architecture, not implementation of every route, adapter, policy, or production concern.

Architecture boundaries are established early. Feature breadth remains narrow.

## ADR-002 — Deterministic drift detection

**Status:** Accepted

Drift is calculated through schema validation, normalization, and explicit comparison.

AI does not determine infrastructure truth because the authoritative path requires reproducibility, exactness, testability, and stable failure semantics.

AI may later provide advisory explanation.

## ADR-003 — SQLite persistence from the first complete slice

**Status:** Accepted

Persistence is central to the assessment because the UI must survive refresh, show history, and expose state across workflow steps.

SQLite provides durable state without external infrastructure.

## ADR-004 — Drizzle unless it becomes a concrete blocker

**Status:** Accepted with fallback

Drizzle matches the original plan and provides typed schema access.

Raw SQLite is an acceptable fallback if package, migration, or ESM friction materially threatens the vertical slice. The repository boundary and migrations remain required either way.

## ADR-005 — One-page operator console

**Status:** Accepted

The first UI is a coherent single-screen console rather than a routed dashboard.

It contains:

- environment/scenario selection;
- run action;
- workflow timeline;
- findings;
- evidence;
- plan review;
- approval controls;
- event log;
- recent runs.

Separate detail pages are deferred.

## ADR-006 — REST snapshots are authoritative

**Status:** Accepted

`GET /api/runs/:runId` returns the complete current run snapshot.

SSE is only a notification mechanism. On a meaningful event, the client refetches the authoritative snapshot.

This avoids reproducing the state machine in React.

## ADR-007 — Minimal SSE

**Status:** Accepted

SSE is retained because progress visibility is part of the product and the README promises streaming progress.

Events may be compact:

```json
{
  "runId": "run_...",
  "version": 7,
  "eventType": "step.completed"
}
```

The client responds by refreshing the run snapshot.

## ADR-008 — Adapter-scoped managed fields

**Status:** Accepted

Adapters compare only fields they own.

For service configuration:

- image;
- replicas;
- environment.

Runtime metadata such as PIDs, health timestamps, or provider-specific annotations is not drift unless explicitly managed.

## ADR-009 — Generated plans are immutable and server-owned

**Status:** Accepted

The remediation plan is derived from validated canonical and observed state.

The browser may approve or reject the plan but cannot submit replacement operations.

## ADR-010 — Evidence digests and provenance

**Status:** Accepted

Plans and findings record:

- canonical digest;
- observed digest;
- engine/version identifier;
- generation timestamp.

This is a lightweight application of Anthesis/Meristem evidence and provenance concepts.

## ADR-011 — Stale-plan protection

**Status:** Accepted

Before reconciliation, the adapter compares the current observed-state digest with the digest stored in the plan.

A mismatch produces `stale_remediation_plan` and no mutation.

## ADR-012 — Atomic replacement

**Status:** Accepted

The local adapter:

1. builds the complete target document;
2. validates it;
3. writes a temporary file in the same directory;
4. flushes where practical;
5. renames atomically;
6. verifies convergence.

The system does not write individual fields incrementally.

## ADR-013 — Documentation drift is a valid adapter

**Status:** Accepted as secondary scope

Documentation drift uses the same canonical-versus-derived model.

The supported form is structured documentation such as:

- Markdown tables;
- frontmatter;
- generated blocks;
- indexes;
- schema references.

Semantic comparison of arbitrary prose is not authoritative.

## ADR-014 — AI is primarily part of the engineering process

**Status:** Accepted

The assessment requires AI-assisted development and a complete interaction log.

The runtime remains deterministic. Optional AI explanation is future work unless the complete core workflow is already finished and tested.

## ADR-015 — No generic workflow framework

**Status:** Accepted

One explicit executor and one run state-machine module are sufficient.

A DAG engine, plugin framework, or generalized orchestration layer would add risk without improving the assessment signal.
