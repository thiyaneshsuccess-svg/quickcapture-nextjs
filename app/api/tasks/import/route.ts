import { NextResponse } from "next/server";

import { importTasks } from "@/lib/tasks/store";

export const dynamic = "force-dynamic";

const MAX_IMPORT_ROWS = 10_000;

/**
 * POST /api/tasks/import
 * Body: { tasks: Task[] } — the exact shape produced by GET /api/tasks and
 * by the automated backups. Preserves ids and timestamps; rows whose id
 * already exists are skipped, so restores are idempotent.
 * Used by scripts/restore.mjs and disaster recovery.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<
  | { ok: true; imported: number; skippedDuplicates: number }
  | { error: string }
>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const tasks = (body as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) {
    return NextResponse.json(
      { error: "Body must be { tasks: [...] } — the shape of a backup file." },
      { status: 400 },
    );
  }
  if (tasks.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_IMPORT_ROWS}).` },
      { status: 413 },
    );
  }

  try {
    const result = await importTasks(tasks);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/tasks/import failed:", error);
    return NextResponse.json(
      { error: "Import failed. Please try again." },
      { status: 500 },
    );
  }
}
