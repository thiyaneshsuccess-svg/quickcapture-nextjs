import { Pool } from "pg";

import type { Task } from "./types";
import { validateTaskText } from "./validation";

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
  const { rows } = await getPool().query<TaskRow>(UPDATE_COMPLETION_SQL, [
    id,
    completed,
  ]);
  if (rows.length === 0) return { ok: false };
  return { ok: true, task: rowToTask(rows[0]) };
}

/** Deletes every completed task. Returns how many were removed. */
export async function deleteCompletedTasks(): Promise<number> {
  const { rowCount } = await getPool().query("DELETE FROM tasks WHERE completed");
  return rowCount ?? 0;
}

/** Deletes every task. Returns how many were removed. */
export async function deleteAllTasks(): Promise<number> {
  const { rowCount } = await getPool().query("DELETE FROM tasks");
  return rowCount ?? 0;
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
