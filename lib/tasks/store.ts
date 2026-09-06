/**
 * Task store facade — the single import point used by the API routes.
 *
 * Backend selection is automatic:
 *   DATABASE_URL set   -> Postgres (lib/tasks/postgres-store.ts, schema: db/schema.sql)
 *   DATABASE_URL unset -> file-backed JSON (lib/tasks/file-store.ts, data/tasks.json)
 *
 * Both implementations satisfy the same contract, so API routes and the UI
 * never change when the backend changes.
 */

import * as fileStore from "./file-store";
import * as postgresStore from "./postgres-store";

const usingPostgres = Boolean(process.env.DATABASE_URL);

if (!usingPostgres && process.env.NEXT_RUNTIME === "nodejs") {
  console.log("QuickCapture: DATABASE_URL not set — using file-backed store");
}

export const backend: "postgres" | "file" = usingPostgres ? "postgres" : "file";

export const listTasks = usingPostgres
  ? postgresStore.listTasks
  : fileStore.listTasks;

export const listTasksByStatus = usingPostgres
  ? postgresStore.listTasksByStatus
  : fileStore.listTasksByStatus;

export const createTask = usingPostgres
  ? postgresStore.createTask
  : fileStore.createTask;

export const setTaskCompleted = usingPostgres
  ? postgresStore.setTaskCompleted
  : fileStore.setTaskCompleted;

export const deleteCompletedTasks = usingPostgres
  ? postgresStore.deleteCompletedTasks
  : fileStore.deleteCompletedTasks;

export const deleteAllTasks = usingPostgres
  ? postgresStore.deleteAllTasks
  : fileStore.deleteAllTasks;

export const pingDatabase = usingPostgres
  ? postgresStore.pingDatabase
  : async () => true;

/** Test helper kept for compatibility: point the file store at a directory. */
export function __setDataDirForTests(dir: string | undefined): void {
  fileStore.__setDataDirForTests(dir);
}
