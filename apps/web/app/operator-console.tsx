"use client";

import type { Environment, RunSnapshot } from "@config-drift-guard/contracts";
import { useEffect, useState, useTransition } from "react";

const lastRunStorageKey = "config-drift-guard:last-run-id";

interface OperatorConsoleProps {
  readonly apiBaseUrl: string;
  readonly environments: readonly Environment[];
}

export function OperatorConsole({ apiBaseUrl, environments }: OperatorConsoleProps) {
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const runId = window.localStorage.getItem(lastRunStorageKey);
    if (runId === null) {
      return;
    }

    async function restoreRun(): Promise<void> {
      setError(null);
      const response = await fetch(`${apiBaseUrl}/api/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) {
        setError(`Unable to load run ${runId}: HTTP ${response.status}`);
        return;
      }

      const nextSnapshot = (await response.json()) as RunSnapshot;
      setSnapshot(nextSnapshot);
      window.localStorage.setItem(lastRunStorageKey, nextSnapshot.run.id);
    }

    void restoreRun();
  }, [apiBaseUrl]);

  const selectedEnvironment = environments.find((environment) => environment.id === environmentId);

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
      window.localStorage.setItem(lastRunStorageKey, nextSnapshot.run.id);
    });
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Operator console</p>
        <h1>Config Drift Guard</h1>
        <p className="lede">
          Start a deterministic service-configuration drift scan, then inspect the persisted
          workflow timeline, findings, evidence digests, and immutable remediation plan.
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

      {snapshot !== null ? <RunDetails snapshot={snapshot} /> : null}
    </main>
  );
}

function RunDetails({ snapshot }: { readonly snapshot: RunSnapshot }) {
  return (
    <section className="detailsGrid">
      <article className="panel widePanel">
        <h2>Findings</h2>
        {snapshot.findings.length === 0 ? (
          <p className="emptyState">No drift found.</p>
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
          <p className="emptyState">No plan generated.</p>
        ) : (
          <pre>{JSON.stringify(snapshot.plan, null, 2)}</pre>
        )}
      </article>
    </section>
  );
}
