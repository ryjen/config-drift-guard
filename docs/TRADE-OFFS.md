# Trade-offs

## 1. Vertical slice over platform breadth

- **Chosen:** Build one narrow but complete workflow end-to-end rather than multiple shallow routes.
- **Cost:** Only two adapters (service-config + documentation), one comparison strategy. Adding a third adapter means writing a new adapter class with load/validate/normalize/apply methods.
- **Benefit:** Everything that exists is demonstrable, tested, and hardened. No speculative abstractions.

## 2. Deterministic rules over AI judgment

- **Chosen:** Drift detection uses explicit schema validation, normalization, and recursion. Severity is assigned by a deterministic function.
- **Cost:** Cannot interpret nuanced semantic drift such as misconfigured environment variable intent, ambiguous documentation prose, or policy implications that require context outside the Fixture.
- **Benefit:** Fully reproducible. SHA-256 digests guarantee exact replays. The operator knows exactly why a Finding exists.

## 3. In-process synchronous executor

- **Chosen:** The workflow executor runs synchronously inside the request handler, scheduled via `setTimeout(execute, 0)`.
- **Cost:** The API process blocks during execution. A large number of settings or a slow observed Fixture read delays the run-detail endpoint. Not horizontally scalable without extracting the executor into a background worker.
- **Benefit:** No queuing infrastructure, worker pool, or message serialisation. Zero network overhead per step. State transitions observable instantly via SSE.

## 4. REST authoritative over real-time push

- **Chosen:** The GET endpoint returns the complete RunSnapshot. SSE payloads are compact (run ID + event ID + type + version).
- **Cost:** SSE-driven refetches cause duplicate serialisation and HTTP overhead compared to full push with inline Finding data.
- **Benefit:** The UI never duplicates the workflow state machine. A page refresh or bookmark reconstruction returns the exact same authoritative state. SSE is optional and failure of the stream does not corrupt the observed state.

## 5. SQLite over PostgreSQL

- **Chosen:** better-sqlite3 with Drizzle ORM.
- **Cost:** No online schema migrations. Not suitable for concurrent write-heavy deployments. Foreign key enforcement does not cover every referential invariant.
- **Benefit:** Zero configuration persistence. Perfect for a local vertical slice. The typed schema is production-viable for single-node deployments.

## 6. One-page console over routed dashboard

- **Chosen:** a single React component renders environment selection, the run timeline, findings, evidence, plan, approval controls, and event log.
- **Cost:** Adding separate detail views or a multi-scenario history page would require extracting child routes and stateful navigation.
- **Benefit:** The evaluator sees everything relevant at once. No URL routing complexities. Refresh-proof with localStorage.

## 7. Adapter-managed fields over universal comparison

- **Chosen:** Each adapter declares a finite set of managed field names. The drift engine compares only those fields.
- **Cost:** An adapter must know its domain at design time. Unexpected runtime metadata is silently ignored.
- **Benefit:** Runtime metadata such as PID, health timestamps, and provider annotations never produce false positives. The engine guarantees that Findings correspond to operator-actionable fields.

## 8. SHA-256 canonical JSON digests over raw Fixture digests

- **Chosen:** Digest computation sorts object keys, strips whitespace, and selects only managed fields.
- **Cost:** Digests do not cover bytes outside managed fields. The operator cannot detect byte-level differences in Fixtures that do not affect managed fields.
- **Benefit:** Digests match exactly what the comparison engine evaluates. Two observed Fixtures that produce the same normalized state have the same digest regardless of irrelevant byte-level noise.

## 9. Immutable remediation plan with stale-guard over live target streaming

- **Chosen:** The plan captures canonical digest, expected observed digest, and the complete target object before approval. Reconciliation re-verifies the observed digest.
- **Cost:** If observed state legitimately changes between plan generation and approval (e.g., a second operator manually corrected the issue), the plan is rejected as stale and the operator must re-run detection.
- **Benefit:** Atomic semantics: the operator approves a fixed target for a fixed observed state. No TOCTOU race between viewing the plan and applying it.

## 10. Atomic temp-file write over incremental patch

- **Chosen:** The adapter builds a complete target document validated by Zod, writes to a temp file in the same directory, `fsync`s the file, `rename`s atomically, and `fsync`s the directory.
- **Cost:** For very large documents, the in-memory and temp-file overhead grows linearly. Partial writes are impossible, preventing last-try semantics on partial network writes.
- **Benefit:** Uninterrupted writes produce either the old content or the new content. Partial corruption cannot occur.
