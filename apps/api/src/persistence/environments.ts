import type { Environment, EnvironmentRepository } from "@config-drift-guard/contracts";
import { environmentSchema } from "@config-drift-guard/contracts";
import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "./database.js";
import { environments } from "./schema.js";

export const serviceConfigEnvironmentId = "env_service_config";
export const documentationEnvironmentId = "env_documentation";

function nowIso(): string {
  return new Date().toISOString();
}

function parseEnvironment(row: typeof environments.$inferSelect): Environment {
  return environmentSchema.parse(row);
}

/** SQLite-backed environment catalog; fixture seeding remains infrastructure-only. */
export class SqliteEnvironmentRepository implements EnvironmentRepository {
  constructor(private readonly db: AppDatabase) {}

  seedServiceConfigEnvironment(): Environment {
    const timestamp = nowIso();
    const environment = {
      id: serviceConfigEnvironmentId,
      name: "Service configuration drift",
      adapterKind: "service_config" as const,
      sourceConfig: {
        scenario: "service-config",
        canonicalFixture: "service-config.desired.yaml",
        observedFixture: "service-config.observed.json",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(environments).values(environment).onConflictDoNothing().run();

    const seeded = this.getEnvironment(environment.id);
    if (seeded === null) {
      throw new Error("service_config_environment_seed_failed");
    }

    return seeded;
  }

  seedDocumentationEnvironment(): Environment {
    const timestamp = nowIso();
    const environment = {
      id: documentationEnvironmentId,
      name: "Structured documentation drift",
      adapterKind: "documentation" as const,
      sourceConfig: {
        scenario: "documentation",
        canonicalFixture: "configuration-schema.yaml",
        observedFixture: "config-reference.md",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(environments).values(environment).onConflictDoNothing().run();

    const seeded = this.getEnvironment(environment.id);
    if (seeded === null) {
      throw new Error("documentation_environment_seed_failed");
    }

    return seeded;
  }

  listEnvironments(): Environment[] {
    return this.db
      .select()
      .from(environments)
      .orderBy(asc(environments.name))
      .all()
      .map(parseEnvironment);
  }

  getEnvironment(environmentId: string): Environment | null {
    const [row] = this.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1)
      .all();
    return row === undefined ? null : parseEnvironment(row);
  }
}
