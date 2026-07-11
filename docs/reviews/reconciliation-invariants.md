# Reconciliation invariant hardening

This change closes a gap in the immutable remediation-plan contract.

A reconciliation plan binds three pieces of state:

- the canonical-state digest used to construct the target;
- the observed-state digest expected before mutation;
- the target-state digest approved by the operator.

Preflight now verifies all three before invoking an adapter mutation. If canonical state changes after planning, the run fails with `stale_canonical_state`, records both digests as evidence, skips apply and verification, and leaves observed state unchanged.

The regression test changes canonical state after plan generation and confirms that reconciliation fails before mutation.
