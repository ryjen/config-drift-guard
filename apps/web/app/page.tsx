import type { Environment } from "@config-drift-guard/contracts";
import { OperatorConsole } from "./operator-console";

export const dynamic = "force-dynamic";

async function readEnvironments(): Promise<{
  readonly apiBaseUrl: string;
  readonly environments: Environment[];
  readonly error: string | null;
}> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/environments`, { cache: "no-store" });

    if (!response.ok) {
      return {
        apiBaseUrl,
        environments: [],
        error: `API returned HTTP ${response.status}`,
      };
    }

    return {
      apiBaseUrl,
      environments: (await response.json()) as Environment[],
      error: null,
    };
  } catch (error) {
    return {
      apiBaseUrl,
      environments: [],
      error: error instanceof Error ? error.message : "Unknown connectivity error",
    };
  }
}

export default async function Home() {
  const { apiBaseUrl, environments, error } = await readEnvironments();

  if (error !== null) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Operator console</p>
          <h1>Config Drift Guard</h1>
          <p className="errorText">
            Unable to reach API at {apiBaseUrl}: {error}
          </p>
        </section>
      </main>
    );
  }

  return <OperatorConsole apiBaseUrl={apiBaseUrl} environments={environments} />;
}
