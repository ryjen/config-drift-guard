import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { JsonValue } from "@config-drift-guard/drift-engine";

export function writeJsonAtomically(path: string, value: JsonValue): void {
  writeTextAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextAtomically(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  const file = openSync(temporaryPath, "w", 0o600);
  try {
    writeFileSync(file, value, "utf8");
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporaryPath, path);
  fsyncDirectory(dirname(path));
}

function fsyncDirectory(path: string): void {
  try {
    const directory = openSync(path, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch {
    // Directory fsync is best-effort across platforms and filesystems.
  }
}
