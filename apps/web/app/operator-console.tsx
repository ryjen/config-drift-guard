"use client";

import type { Environment, RunSnapshot } from "@config-drift-guard/contracts";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

const lastRunStorageKey = "config-drift-guard:last-run-id";

interface OperatorConsoleProps {
  readonly apiBaseUrl: string;
  readonly environments: readonly Environment[];
}

interface LiveNotification {
  readonly eventId: number;
  readonly eventType: string;
  readonly runId: string;
  readonly version: number;
}

export function OperatorConsole({ apiBaseUrl, environments }: OperatorConsoleProps) {
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveNotifications, setLiveNotifications] = useState<LiveNotification[]>([]);
  const [isPending, startTransition] = useTransition();
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunId = snapshot?.run.id ?? null;

  const flashNotice = useCallback((message: string) => {
    if (noticeTimer.current !== null) {
      clearTimeout(noticeTimer.current);
    }
    setNotice(message);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const runId = window.localStorage.getItem(lastRunStorageKey);
    if (runId === null) {
      return;
    }
    const restoredRunId = runId;

    async function restoreRun(): Promise<void> {
      setError(null);
      await refreshRun(apiBaseUrl, restoredRunId, setSnapshot, setEnvironmentId, setError);
    }

    void restoreRun();
  }, [apiBaseUrl]);

  useEffect(() => {
    if (activeRunId === null) {
      return;
    }

    const eventSource = new EventSource(`${apiBaseUrl}/api/runs/${activeRunId}/events`);
    eventSource.addEventListener("run-change", (message) => {
      const notification = JSON.parse(message.data) as LiveNotification;
      setLiveNotifications((current) => [notification, ...current].slice(0, 8));
      void refreshRun(apiBaseUrl, notification.runId, setSnapshot, setEnvironmentId, setError);
    });
    return () => eventSource.close();
  }, [activeRunId, apiBaseUrl]);

  const selectedEnvironment = environments.find((environment) => environment.id === environmentId);

  function decideRun(action: "approve" | "reject"): void {
    if (snapshot === null) {
      return;
    }

    const runId = snapshot.run.id;
    startTransition(async () => {
      setError(null);
      const response = await fetch(`${apiBaseUrl}/api/runs/${runId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: null }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(`${action} failed: ${payload?.error ?? `HTTP ${response.status}`}`);
        return;
      }

      const nextSnapshot = (await response.json()) as RunSnapshot;
      setSnapshot(nextSnapshot);
      window.localStorage.setItem(lastRunStorageKey, nextSnapshot.run.id);
      flashNotice(
        action === "approve" ? "Reconciliation approved — workflow executing" : "Plan rejected",
      );
    });
  }

  function startRun(): void {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`${apiBaseUrl}/api/environments/${environmentId}/runs`, {
        method: "POST",
      });

      if (!response.ok) {
        setError(`Run failed to start: HTTP ${response.status}`);
        return;
      }

      const nextSnapshot = (await response.json()) as RunSnapshot;
      setSnapshot(nextSnapshot);
      setLiveNotifications([]);
      window.localStorage.setItem(lastRunStorageKey, nextSnapshot.run.id);
    });
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Operator console</p>
        <h1>Config Drift Guard</h1>
        <p className="lede">
          Start a deterministic drift scan, then inspect the persisted workflow timeline, findings,
          evidence digests, and immutable remediation plan.
        </p>
      </header>

      <section className="consoleGrid">
        <aside className="panel environmentPanel">
          <h2>Environment</h2>
          <label className="field">
            Scenario
            <select
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
            >
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </label>
          <dl className="compactFacts">
            <div>
              <dt>Adapter</dt>
              <dd>{selectedEnvironment?.adapterKind ?? "unknown"}</dd>
            </div>
            <div>
              <dt>Canonical</dt>
              <dd>{selectedEnvironment?.sourceConfig.canonicalFixture ?? "not loaded"}</dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{selectedEnvironment?.sourceConfig.observedFixture ?? "not loaded"}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={startRun}
            disabled={isPending || environmentId.length === 0}
          >
            {isPending ? "Running scan..." : "Run drift scan"}
          </button>
          {error !== null ? <p className="errorText">{error}</p> : null}
          {notice !== null ? <p className="noticeText">{notice}</p> : null}
        </aside>

        <section className="panel runPanel">
          <div className="sectionHeader">
            <h2>Current run</h2>
            <span className={`statusPill ${snapshot?.run.status ?? "idle"}`}>
              {snapshot?.run.status ?? "idle"}
            </span>
          </div>
          {snapshot === null ? (
            <p className="emptyState">
              No run loaded. Start a drift scan to create a persisted run.
            </p>
          ) : (
            <ol className="timeline">
              {snapshot.steps.map((step) => (
                <li key={step.key} className={step.status}>
                  <span>{step.key}</span>
                  <strong>{step.status}</strong>
                  <small>{step.message ?? "No message"}</small>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>

      {snapshot !== null ? (
        <RunDetails
          isPending={isPending}
          liveNotifications={liveNotifications}
          onDecision={decideRun}
          snapshot={snapshot}
        />
      ) : null}
    </main>
  );
}

async function refreshRun(
  apiBaseUrl: string,
  runId: string,
  setSnapshot: (snapshot: RunSnapshot) => void,
  setEnvironmentId: (id: string) => void,
  setError: (message: string | null) => void,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/runs/${runId}`, { cache: "no-store" });
  if (!response.ok) {
    setError(`Unable to load run ${runId}: HTTP ${response.status}`);
    return;
  }

  const nextSnapshot = (await response.json()) as RunSnapshot;
  setSnapshot(nextSnapshot);
  setEnvironmentId(nextSnapshot.run.environmentId);
  setError(null);
  window.localStorage.setItem(lastRunStorageKey, nextSnapshot.run.id);
}

function RunDetails({
  isPending,
  liveNotifications,
  onDecision,
  snapshot,
}: {
  readonly isPending: boolean;
  readonly liveNotifications: readonly LiveNotification[];
  readonly onDecision: (action: "approve" | "reject") => void;
  readonly snapshot: RunSnapshot;
}) {
  const canDecide = snapshot.run.status === "awaiting_approval" && snapshot.decision === null;

  return (
    <section className="detailsGrid">
      <article className="panel widePanel">
        <h2>Findings</h2>
        {snapshot.findings.length === 0 ? (
          <p className="emptyState">
            {["queued", "running"].includes(snapshot.run.status)
              ? "Findings pending."
              : snapshot.run.status === "failed"
                ? "Findings unavailable."
                : snapshot.run.status === "succeeded"
                  ? "Verification found no remaining drift."
                  : "No drift found."}
          </p>
        ) : (
          <div className="findingList">
            {snapshot.findings.map((finding) => (
              <div key={finding.id} className="findingCard">
                <div>
                  <strong>{finding.resourceId}</strong>
                  <code>{finding.path}</code>
                </div>
                <span className={`severity ${finding.severity}`}>{finding.severity}</span>
                <p>
                  {finding.kind}: observed <code>{JSON.stringify(finding.observedValue)}</code>,
                  desired <code>{JSON.stringify(finding.canonicalValue)}</code>
                </p>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel">
        <h2>Evidence</h2>
        <dl className="compactFacts">
          <div>
            <dt>Run ID</dt>
            <dd>{snapshot.run.id}</dd>
          </div>
          <div>
            <dt>Canonical digest</dt>
            <dd>{snapshot.run.canonicalDigest ?? "pending"}</dd>
          </div>
          <div>
            <dt>Observed digest</dt>
            <dd>{snapshot.run.observedDigest ?? "pending"}</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>{snapshot.run.findingCount}</dd>
          </div>
        </dl>
      </article>

      <article className="panel widePanel">
        <h2>Remediation plan</h2>
        {snapshot.plan === null ? (
          <p className="emptyState">
            {["queued", "running"].includes(snapshot.run.status)
              ? "Plan pending."
              : snapshot.run.status === "failed"
                ? "Plan unavailable."
                : "No plan generated."}
          </p>
        ) : (
          <>
            <dl className="compactFacts planFacts">
              <div>
                <dt>Expected observed digest</dt>
                <dd>{snapshot.plan.expectedObservedDigest}</dd>
              </div>
              <div>
                <dt>Engine version</dt>
                <dd>{snapshot.plan.engineVersion}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>
                  {snapshot.decision === null
                    ? "awaiting local operator"
                    : `${snapshot.decision.action} by ${snapshot.decision.actor}`}
                </dd>
              </div>
            </dl>
            <pre>{JSON.stringify(snapshot.plan, null, 2)}</pre>
            <div className="decisionControls">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => onDecision("reject")}
                disabled={!canDecide || isPending}
              >
                Reject plan
              </button>
              <button
                type="button"
                onClick={() => onDecision("approve")}
                disabled={!canDecide || isPending}
              >
                Approve reconcile
              </button>
            </div>
            <p className="emptyState">
              Approval submits only a local-operator decision. Replacement operations are generated
              and applied server-side from the immutable plan.
            </p>
          </>
        )}
      </article>

      <article className="panel widePanel">
        <h2>Event log</h2>
        {snapshot.events.length === 0 ? (
          <p className="emptyState">No events persisted.</p>
        ) : (
          <ol className="eventLog">
            {snapshot.events.map((event) => (
              <li key={event.id}>
                <code>#{event.id}</code>
                <strong>{event.eventType}</strong>
                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ol>
        )}
      </article>

      <article className="panel widePanel">
        <h2>Live workflow timeline</h2>
        {liveNotifications.length === 0 ? (
          <p className="emptyState">Waiting for compact SSE notifications.</p>
        ) : (
          <ol className="eventLog liveLog">
            {liveNotifications.map((event) => (
              <li key={event.eventId}>
                <code>#{event.eventId}</code>
                <strong>{event.eventType}</strong>
                <span>run version {event.version}</span>
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}
