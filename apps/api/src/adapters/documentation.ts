import { existsSync, readFileSync } from "node:fs";
import {
  digestJson,
  digestNormalizedResourceState,
  type JsonObject,
  type JsonValue,
  type NormalizedResourceState,
} from "@config-drift-guard/drift-engine";
import { z } from "zod";
import { writeTextAtomically } from "./atomic-file.js";
import { type ApplyResult, StaleRemediationPlanError } from "./service-config.js";

const schemaPropertySchema = z.object({
  type: z.enum(["string", "integer", "number", "boolean"]),
  default: z.union([z.string(), z.number(), z.boolean()]),
});

const canonicalSchema = z.object({
  properties: z.record(z.string().min(1), schemaPropertySchema),
});

const normalizedSettingSchema = z.record(
  z.string().min(1),
  z.object({
    type: schemaPropertySchema.shape.type,
    default: z.string(),
  }),
);

const seededCanonical = {
  properties: {
    retries: { type: "integer", default: 3 },
    timeout: { type: "integer", default: 30 },
  },
} satisfies JsonValue;

const seededObservedMarkdown = `# Runtime Configuration Reference

<!-- config-drift-guard:start -->
| Setting | Type | Default |
|---|---|---|
| legacy_mode | boolean | false |
| retries | integer | 5 |
<!-- config-drift-guard:end -->
`;

export class DocumentationAdapter {
  readonly kind = "documentation" as const;

  constructor(
    private readonly observedPath = process.env.CONFIG_DRIFT_GUARD_DOCUMENTATION_STATE ??
      "./data/config-reference.md",
  ) {}

  loadCanonical(): JsonValue {
    return cloneJson(seededCanonical);
  }

  loadObserved(): JsonValue {
    this.ensureObservedStateFile();
    return readFileSync(this.observedPath, "utf8");
  }

  validateCanonical(input: JsonValue): void {
    canonicalSchema.parse(input);
  }

  normalizeCanonical(input: JsonValue): NormalizedResourceState {
    const parsed = canonicalSchema.parse(input);
    const settings = sortedSettings(
      Object.fromEntries(
        Object.entries(parsed.properties).map(([name, property]) => [
          name,
          { type: property.type, default: String(property.default) },
        ]),
      ),
    );

    return {
      resourceId: "config-reference-table",
      value: settings,
      managedFields: Object.keys(settings),
    };
  }

  normalizeObserved(input: JsonValue, resourceId: string): NormalizedResourceState {
    if (typeof input !== "string") {
      throw new Error("documentation_markdown_must_be_string");
    }

    const settings = parseManagedTable(input);
    return {
      resourceId,
      value: settings,
      managedFields: Object.keys(settings),
    };
  }

  applyTarget(expectedObservedDigest: string, target: JsonValue): ApplyResult {
    const canonical = this.normalizeCanonical(this.loadCanonical());
    const observedRaw = this.loadObserved();
    if (typeof observedRaw !== "string") {
      throw new Error("documentation_markdown_must_be_string");
    }
    const observed = this.normalizeObserved(observedRaw, canonical.resourceId);
    const currentObservedDigest = digestNormalizedResourceState(observed);
    if (currentObservedDigest !== expectedObservedDigest) {
      throw new StaleRemediationPlanError(expectedObservedDigest, currentObservedDigest);
    }

    const parsedTarget = normalizedSettingSchema.parse(target);
    const nextMarkdown = replaceManagedBlock(
      observedRaw,
      renderManagedTable(sortedSettings(parsedTarget)),
    );
    writeTextAtomically(this.observedPath, nextMarkdown);

    const observedAfter = this.normalizeObserved(this.loadObserved(), canonical.resourceId);
    return {
      observedDigestBefore: currentObservedDigest,
      observedDigestAfter: digestNormalizedResourceState(observedAfter),
      targetDigest: digestJson(target as JsonValue),
    };
  }

  resetObserved(): void {
    writeTextAtomically(this.observedPath, seededObservedMarkdown);
  }

  private ensureObservedStateFile(): void {
    if (!existsSync(this.observedPath)) {
      this.resetObserved();
    }
  }
}

function parseManagedTable(markdown: string): JsonObject {
  const block = getManagedBlock(markdown);
  const rows = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  const dataRows = rows.slice(2);
  const settings: Record<string, JsonValue> = {};

  for (const row of dataRows) {
    const cells = row
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 3) {
      throw new Error("documentation_table_row_invalid");
    }

    const [setting, type, defaultValue] = cells;
    if (
      setting === undefined ||
      type === undefined ||
      defaultValue === undefined ||
      setting === ""
    ) {
      throw new Error("documentation_table_row_invalid");
    }
    if (Object.hasOwn(settings, setting)) {
      throw new Error(`duplicate_documentation_setting:${setting}`);
    }

    settings[setting] = { type, default: defaultValue };
  }

  return sortedSettings(normalizedSettingSchema.parse(settings));
}

function getManagedBlock(markdown: string): string {
  const match = markdown.match(
    /<!-- config-drift-guard:start -->(?<block>[\s\S]*?)<!-- config-drift-guard:end -->/,
  );
  if (match?.groups?.block === undefined) {
    throw new Error("managed_documentation_block_missing");
  }

  return match.groups.block.trim();
}

function replaceManagedBlock(markdown: string, table: string): string {
  if (!markdown.includes("<!-- config-drift-guard:start -->")) {
    throw new Error("managed_documentation_block_missing");
  }

  return markdown.replace(
    /<!-- config-drift-guard:start -->[\s\S]*?<!-- config-drift-guard:end -->/,
    `<!-- config-drift-guard:start -->\n${table}\n<!-- config-drift-guard:end -->`,
  );
}

function renderManagedTable(settings: JsonObject): string {
  const rows = ["| Setting | Type | Default |", "|---|---|---|"];
  for (const [name, value] of Object.entries(settings)) {
    const parsed = schemaPropertySchema.parse(value);
    rows.push(`| ${name} | ${parsed.type} | ${parsed.default} |`);
  }

  return rows.join("\n");
}

function sortedSettings(input: Record<string, { type: string; default: string }>): JsonObject {
  return Object.fromEntries(
    Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [name, { type: value.type, default: value.default }]),
  );
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
