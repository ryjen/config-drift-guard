interface SqliteErrorLike extends Error {
  readonly code?: unknown;
}

export function isActiveRunConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteError = error as SqliteErrorLike;
  return (
    sqliteError.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.includes("UNIQUE constraint failed: runs.environment_id")
  );
}
