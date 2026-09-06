import { Pool } from "pg";

import type { Task } from "./types";
import { validateImportedTask, validateTaskText } from "./validation";

/**
 * Postgres-backed task store — the "basic backend" for serverless hosts
 * (Vercel) and any deployment that needs durable storage.
 *
 * Activated automatically when DATABASE_URL is set (see ./store.ts).
 * Works with any Postgres: Render Postgres, Supabase, Neon, local docker.
 * Schema lives in db/schema.sql; apply it once with psql.
 *
 * Uses parameterized queries only (no string-built SQL). A single shared
 * Pool is created lazily and reused across invocations so warm serverless
 * containers keep their connections.
 */

const UPDATE_COMPLETION_SQL = `
  UPDATE tasks
     SET completed = $2
   WHERE id = $1
RETURNING id, text, completed, created_at, completed_at, updated_at`;

/**
 * Idempotent boot-time provisioning: creates the table, indexes, and the
 * completion-rule trigger on first use, so deploys need no manual psql step
 * (Render free Postgres and Vercel cannot run init scripts for you).
 * Runs once per runtime; a failed attempt clears the cache so the next
 * request retries. Safe under concurrency (IF NOT EXISTS + error tolerance).
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text VARCHAR(500) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);

CREATE OR REPLACE FUNCTION set_task_completion_timestamps()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.completed THEN
    NEW.completed_at := NOW();
  ELSE
    NEW.completed_at := NULL;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_completion ON tasks;
CREATE TRIGGER trg_tasks_completion
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_completion_timestamps();
`;

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= getPool()
    .query(SCHEMA_SQL)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null; // allow a retry on the next request
      const code = (error as { code?: string }).code;
      // 42P07 duplicate_table / 42710 duplicate_object: a concurrent
      // runtime won the race — the schema exists, so we can proceed.
      if (code === "42P07" || code === "42710") return;
      throw error;
    });
  return schemaReady;
}

function getPool(): Pool {
  globalThis.__quickcapturePgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    // Serverless platforms open many short-lived lambdas; without a cap the
    // pool can exhaust the database's connection limit.
    max: Number(process.env.PGPOOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: /^true$/i.test(process.env.PGSSLMODE_REQUIRE ?? "")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  return globalThis.__quickcapturePgPool;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: String(row.id),
    text: row.text,
    completed: row.completed,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at ? row.completed_at.toISOString() : null,
    updated_at: row.updated_at.toISOString(),
  };
}

interface TaskRow {
  id: string;
  text: string;
  completed: boolean;
  created_at: Date;
  completed_at: Date | null;
  updated_at: Date;
}

/** All tasks, newest first (created_at DESC, id tiebreaker for rapid captures). */
export async function listTasks(): Promise<Task[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TaskRow>(
    "SELECT id, text, completed, created_at, completed_at, updated_at FROM tasks ORDER BY created_at DESC, id DESC",
  );
  return rows.map(rowToTask);
}

/** The subset matching the filter (mirrors GET /api/tasks?status=…). */
export async function listTasksByStatus(
  status: "all" | "pending" | "done",
): Promise<Task[]> {
  if (status === "all") return listTasks();
  await ensureSchema();
  const { rows } = await getPool().query<TaskRow>(
    "SELECT id, text, completed, created_at, completed_at, updated_at FROM tasks WHERE completed = $1 ORDER BY created_at DESC, id DESC",
    [status === "done"],
  );
  return rows.map(rowToTask);
}

/** Creates a task. `text` is validated server-side; the DB generates id/timestamps. */
export async function createTask(rawText: unknown): Promise<
  { ok: true; task: Task } | { ok: false; error: string }
> {
  const validation = validateTaskText(rawText);
  if (!validation.ok) return validation;

  await ensureSchema();
  const { rows } = await getPool().query<TaskRow>(
    "INSERT INTO tasks (text) VALUES ($1) RETURNING id, text, completed, created_at, completed_at, updated_at",
    [validation.text],
  );
  return { ok: true, task: rowToTask(rows[0]) };
}

/**
 * Sets the completion flag. The database trigger owns completed_at /
 * updated_at per the spec's completion rules, so this stays a single UPDATE.
 */
export async function setTaskCompleted(
  id: string,
  completed: boolean,
): Promise<{ ok: true; task: Task } | { ok: false }> {
  // The id column is UUID; an invalid id must read as "not found", not a 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false };
  }
  await ensureSchema();
  const { rows } = await getPool().query<TaskRow>(UPDATE_COMPLETION_SQL, [
    id,
    completed,
  ]);
  if (rows.length === 0) return { ok: false };
  return { ok: true, task: rowToTask(rows[0]) };
}

/** Deletes every completed task. Returns how many were removed. */
export async function deleteCompletedTasks(): Promise<number> {
  await ensureSchema();
  const { rowCount } = await getPool().query("DELETE FROM tasks WHERE completed");
  return rowCount ?? 0;
}

/** Deletes every task. Returns how many were removed. */
export async function deleteAllTasks(): Promise<number> {
  await ensureSchema();
  const { rowCount } = await getPool().query("DELETE FROM tasks");
  return rowCount ?? 0;
}

/**
 * Restores tasks from a backup, preserving ids and timestamps exactly and
 * skipping rows whose id already exists (ON CONFLICT DO NOTHING). Invalid
 * rows are silently dropped; valid-but-duplicate rows are counted.
 */
export async function importTasks(
  tasks: unknown[],
): Promise<{ imported: number; skippedDuplicates: number }> {
  await ensureSchema();
  const pool = getPool();
  let validated = 0;
  let imported = 0;
  for (const raw of tasks) {
    const check = validateImportedTask(raw);
    if (!check.ok) continue;
    validated += 1;
    const { rowCount } = await pool.query(
      `INSERT INTO tasks (id, text, completed, created_at, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        check.id,
        check.text,
        check.completed,
        check.created_at,
        check.completed_at,
        check.updated_at,
      ],
    );
    imported += rowCount ?? 0;
  }
  return { imported, skippedDuplicates: validated - imported };
}

/** Probe used by /health. Never throws. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}