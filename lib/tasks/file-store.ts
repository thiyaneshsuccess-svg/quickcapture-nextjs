import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Task } from "./types";
import { validateTaskText } from "./validation";

/**
 * File-backed task store implementing the spec's data contract.
 *
 * Tasks persist to <dataDir>/tasks.json with best-effort POSIX-style locking
 * (O_EXCL lock file with retry/timeout) so concurrent Next.js server workers
 * never corrupt the snapshot. Atomic writes (tmp file + rename) mean a crash
 * mid-write can never leave a half-written store. `next build` imports this
 * module for static analysis, so all filesystem work is deferred to runtime
 * functions and guarded against build-time evaluation.
 *
 * This is the no-credentials persistence layer. To move to Supabase/Postgres,
 * run `supabase/schema.sql`, install `@supabase/supabase-js`, and re-implement
 * only the functions below — the API routes and UI do not change.
 */

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 25;

function getDataFilePath(): string {
  const dataDir =
    process.env.QUICKCAPTURE_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "tasks.json");
}

/**
 * Probes that the configured data directory is writable; if not (bad env
 * config, read-only filesystem), falls back to a writable temp dir so the
 * app keeps working rather than failing every write with a 500. Resolved
 * once and cached for the process lifetime.
 */
let cachedFilePath: string | null = null;
async function resolveWritableFilePath(): Promise<string> {
  if (cachedFilePath) return cachedFilePath;
  const preferred = getDataFilePath();
  try {
    await fs.mkdir(path.dirname(preferred), { recursive: true });
    const probe = `${preferred}.probe`;
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    cachedFilePath = preferred;
  } catch (error) {
    console.error(
      `QuickCapture: data dir not writable (${(error as Error).message}); falling back to os.tmpdir()`,
    );
    cachedFilePath = path.join(os.tmpdir(), "quickcapture-tasks.json");
  }
  return cachedFilePath;
}

async function readTasksFile(filePath: string): Promise<Task[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") return [];
    // Corrupt snapshot: start fresh rather than bricking the app.
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeTasksFile(
  filePath: string,
  tasks: Task[],
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(tasks, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

interface LockGuard {
  release: () => Promise<void>;
}

async function acquireLock(filePath: string): Promise<LockGuard> {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let acquired = false;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
      acquired = true;
      break;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "EEXIST") {
        // Stale lock from a dead process: reclaim it after a grace period.
        try {
          const stat = await fs.stat(lockPath);
          if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
            await fs.unlink(lockPath).catch(() => {});
            continue;
          }
        } catch {
          // Lock vanished between the write attempt and stat — retry.
        }
        await sleep(LOCK_RETRY_MS);
      } else {
        break;
      }
    }
  }

  if (!acquired) {
    // Last resort: proceed without the lock rather than failing user writes.
    console.error("QuickCapture: lock acquisition failed, proceeding unlocked", lastError);
  }

  return {
    release: async () => {
      if (acquired) await fs.unlink(lockPath).catch(() => {});
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** All tasks, newest first (created_at DESC, id tiebreaker for rapid captures). */
export async function listTasks(): Promise<Task[]> {
  const filePath = await resolveWritableFilePath();
  const lock = await acquireLock(filePath);
  try {
    const tasks = await readTasksFile(filePath);
    return sortTasks(tasks);
  } finally {
    await lock.release();
  }
}

/** The subset matching `completed` (mirrors GET /api/tasks?status=…). */
export async function listTasksByStatus(
  status: "all" | "pending" | "done",
): Promise<Task[]> {
  const tasks = await listTasks();
  if (status === "all") return tasks;
  return tasks.filter((t) => (status === "done" ? t.completed : !t.completed));
}

/** Creates a task. `text` is validated server-side; the ID and timestamps are generated here. */
export async function createTask(rawText: unknown): Promise<
  | { ok: true; task: Task }
  | { ok: false; error: string }
> {
  const validation = validateTaskText(rawText);
  if (!validation.ok) return validation;

  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    text: validation.text,
    completed: false,
    created_at: now,
    completed_at: null,
    updated_at: now,
  };

  const filePath = await resolveWritableFilePath();
  const lock = await acquireLock(filePath);
  try {
    const tasks = await readTasksFile(filePath);
    tasks.push(task);
    await writeTasksFile(filePath, tasks);
  } finally {
    await lock.release();
  }

  return { ok: true, task };
}

/** Result of a completion toggle, or ok:false if no task has that id. */
export async function setTaskCompleted(
  id: string,
  completed: boolean,
): Promise<{ ok: true; task: Task } | { ok: false }> {
  const filePath = await resolveWritableFilePath();
  const lock = await acquireLock(filePath);
  try {
    const tasks = await readTasksFile(filePath);
    const task = tasks.find((t) => t.id === id);
    if (!task) return { ok: false };

    const now = new Date().toISOString();
    task.completed = completed;
    task.completed_at = completed ? now : null;
    task.updated_at = now;

    await writeTasksFile(filePath, tasks);
    return { ok: true, task: { ...task } };
  } finally {
    await lock.release();
  }
}

/** Deletes every completed task. Returns how many were removed. */
export async function deleteCompletedTasks(): Promise<number> {
  const filePath = await resolveWritableFilePath();
  const lock = await acquireLock(filePath);
  try {
    const tasks = await readTasksFile(filePath);
    const remaining = tasks.filter((t) => !t.completed);
    const removed = tasks.length - remaining.length;
    if (removed > 0) {
      await writeTasksFile(filePath, remaining);
    }
    return removed;
  } finally {
    await lock.release();
  }
}

/** Deletes every task. Returns how many were removed. */
export async function deleteAllTasks(): Promise<number> {
  const filePath = await resolveWritableFilePath();
  const lock = await acquireLock(filePath);
  try {
    const tasks = await readTasksFile(filePath);
    if (tasks.length > 0) {
      await writeTasksFile(filePath, []);
    }
    return tasks.length;
  } finally {
    await lock.release();
  }
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    return byCreated !== 0 ? byCreated : b.id.localeCompare(a.id);
  });
}

/** Test helper: point the store at an isolated directory. */
export function __setDataDirForTests(dir: string | undefined): void {
  if (process.env.NODE_ENV === "test" || process.env.QUICKCAPTURE_DATA_DIR) {
    process.env.QUICKCAPTURE_DATA_DIR = dir;
  }
}
