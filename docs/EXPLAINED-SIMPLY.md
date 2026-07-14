# Config Drift Guard, Explained Simply

Imagine a room with two lists.

One list says what the room **should** look like:

- four chairs;
- a blue table;
- the lights turned on.

The other list says what the room **actually** looks like:

- two chairs;
- a red table;
- the lights turned off.

Config Drift Guard compares the two lists and says, “These things do not match.”

It then creates a repair plan:

- add two chairs;
- make the table blue;
- turn the lights on.

But it does not change anything immediately. It first shows the exact plan to a person and asks for approval.

If the person approves, the system checks the room again. This makes sure nobody changed it while the plan was being reviewed. It then carefully performs the repair and checks one final time that the room now matches the trusted list.

## What this means for software

In the real project, the room is a computer system.

The first list is the **canonical state**: the trusted description of how the system should be configured.

The second list is the **observed state**: what the system actually looks like right now.

When those states differ, that is called **configuration drift**.

Config Drift Guard:

1. reads what should exist;
2. reads what actually exists;
3. finds the differences;
4. creates a repair plan;
5. waits for a person to approve it;
6. applies the approved changes safely;
7. checks that the repair worked.

## What makes the project special

### It asks permission before making changes

The system does not immediately repair everything it finds. It first shows a person the exact remediation plan and waits for approval.

### It remembers exactly what was approved

The approved plan is stored as an immutable artifact with a cryptographic digest—like a special fingerprint. The browser can approve a server-generated plan, but it cannot quietly replace that plan with arbitrary instructions.

### It notices if reality changed during review

Before applying the plan, the system reads the observed state again. If anything changed after the plan was created, it stops instead of applying an outdated plan.

This is like noticing that someone moved a chair while you were deciding what to fix.

### It changes only the things it owns

The system may be allowed to manage the chairs and lights, but not someone’s backpack.

In the same way, each adapter declares exactly which configuration fields it owns. Unmanaged runtime information is preserved.

### It checks its own work

The system does not call the operation successful merely because a write completed. It compares the states again and succeeds only when the observed state has converged to the canonical state.

### It writes changes safely

The system prepares the replacement separately and swaps it into place only when it is complete. This reduces the risk of leaving a half-written or corrupted configuration file.

### It keeps a history

The project records scans, workflow steps, findings, remediation plans, decisions, changes, events, and verification results. An operator can later inspect what happened and why.

### It handles failures explicitly

If a file is malformed, a plan becomes stale, a write fails, or the process stops halfway through, the workflow records a clear failure instead of pretending everything worked.

### It can check different kinds of state

One adapter checks service settings such as software images, replica counts, and environment variables.

Another checks whether structured documentation still matches the official configuration. The same control-plane workflow can therefore work with different kinds of managed state.

### AI helps build the system, but does not control it

AI was used to assist planning, implementation, review, testing, threat modelling, and documentation.

Exact rules—not AI guesses—determine whether drift exists, whether a plan is valid, and whether a change is allowed.

## The big idea

Config Drift Guard is a careful robot inspector for computer systems.

It says:

> Here is what should exist.
>
> Here is what actually exists.
>
> Here are the differences.
>
> Here is the exact repair I recommend.
>
> May I continue?
>
> The repair is complete, and I checked that it worked.

For the implementation details, see [Architecture](ARCHITECTURE.md), [Architectural decisions](DECISIONS.md), and the [demo walkthrough](DEMO.md).
