import { NextResponse } from "next/server";

import {
  createTask,
  deleteAllTasks,
  listTasksByStatus,
} from "@/lib/tasks/store";
import type { Task, TasksResponse } from "@/lib/tasks/types";
import { validateTaskText } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["all", "pending", "done"] as const;
type Status = (typeof VALID_STATUSES)[number];

function countsFor(tasks: Task[]): TasksResponse["counts"] {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  return { pending: total - done, done, total };
}

/**
 * GET /api/tasks?status=all|pending|done
 * Returns `{ tasks, counts }` so the client never needs a second request
 * to keep the header counts accurate after filtering.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<TasksResponse | { error: string }>> {
  const statusParam = new URL(request.url).searchParams.get("status");
  const status: Status = (VALID_STATUSES as readonly string[]).includes(
    statusParam ?? "",
  )
    ? (statusParam as Status)
    : "all";

  try {
    const tasks = await listTasksByStatus(status);
    return NextResponse.json({ tasks, counts: countsFor(tasks) });
  } catch (error) {
    console.error("GET /api/tasks failed:", error);
    return NextResponse.json(
      { error: "Could not load tasks. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tasks
 * Body: { text: string }
 * Server-side validation, server-generated id + timestamps.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<TasksResponse | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const text = (body as { text?: unknown } | null)?.text;
  const validation = validateTaskText(text);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const result = await createTask(validation.text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Return the full all-view + counts so optimistic state can be reconciled
    // exactly (correct order across rapid captures) with one payload.
    const tasks = await listTasksByStatus("all");
    return NextResponse.json(
      { tasks, counts: countsFor(tasks) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/tasks failed:", error);
    return NextResponse.json(
      { error: "Could not save the task. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/tasks
 * Removes every task. The UI must confirm before calling this
 * (spec: "Clear all cannot execute without confirmation").
 */
export async function DELETE(): Promise<
  NextResponse<TasksResponse | { error: string }>
> {
  try {
    await deleteAllTasks();
    return NextResponse.json({
      tasks: [],
      counts: { pending: 0, done: 0, total: 0 },
    });
  } catch (error) {
    console.error("DELETE /api/tasks failed:", error);
    return NextResponse.json(
      { error: "Could not clear tasks. Please try again." },
      { status: 500 },
    );
  }
}
