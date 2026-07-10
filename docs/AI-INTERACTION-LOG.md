# AI Interaction Log

## AI-use statement

AI tools are used for requirements interpretation, architectural exploration, planning, implementation acceleration, test generation, security review, adversarial review, and documentation reconciliation.

The deterministic application remains human-owned. AI suggestions are reviewed before commit.

## Required evidence per session

Record:

- complete prompt;
- complete response and follow-up interaction;
- intended milestone;
- resulting commit SHA;
- author decisions;
- accepted suggestions;
- rejected suggestions;
- corrections requested;
- commands run;
- manual verification;
- known limitations.

## Important decisions already established

- Build an evaluator-ready vertical slice.
- Keep SQLite early.
- Use Drizzle unless it becomes a blocker.
- Use one operator console.
- Keep REST authoritative.
- Use minimal SSE.
- Keep drift deterministic.
- Use AI primarily as an engineering collaborator.
- Borrow evidence, provenance, approval, stale-plan checks, and verification from Anthesis/Meristem.
- Support structured documentation drift as a secondary adapter.
- Avoid generic workflow and governance frameworks.

## Session template

```markdown
## Session NN — Title

**Date:**
**Tool/model:**
**Milestone:**
**Commit:**

### Objective

### Complete prompt

### Complete interaction

### Author decisions

### Accepted suggestions

### Rejected suggestions

### Corrections

### Verification

### Result and remaining risks
```
