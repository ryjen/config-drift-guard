import type { HealthResponse } from "@config-drift-guard/contracts";

export const dynamic = "force-dynamic";

async function readHealth(): Promise<
  | { connected: true; apiBaseUrl: string; payload: HealthResponse }
  | { connected: false; apiBaseUrl: string; error: string }
> {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/health`, { cache: "no-store" });

    if (!response.ok) {
      return {
        apiBaseUrl,
        connected: false,
        error: `API returned HTTP ${response.status}`,
      };
    }

    return {
      apiBaseUrl,
      connected: true,
      payload: (await response.json()) as HealthResponse,
    };
  } catch (error) {
    return {
      apiBaseUrl,
      connected: false,
      error: error instanceof Error ? error.message : "Unknown connectivity error",
    };
  }
}

export default async function Home() {
  const health = await readHealth();

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Foundation milestone</p>
        <h1>Config Drift Guard</h1>
        <p className="lede">
          This initial operator console verifies that the Next.js frontend can reach the
          loopback-bound Fastify API. Drift workflows, persistence, and reconciliation are deferred
          to later milestones.
        </p>
        <dl className="statusGrid">
          <div>
            <dt>API base URL</dt>
            <dd>{health.apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Connectivity</dt>
            <dd className={health.connected ? "ok" : "error"}>
              {health.connected ? "Connected" : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Health payload</dt>
            <dd>
              <code>{health.connected ? JSON.stringify(health.payload) : health.error}</code>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
