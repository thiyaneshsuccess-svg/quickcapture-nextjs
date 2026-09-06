import { NextResponse } from "next/server";

import { deleteCompletedTasks, listTasksByStatus } from "@/lib/tasks/store";
import type { TasksResponse } from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/tasks/completed
 * Removes only completed tasks and returns the remaining all-view + counts
 * so the client can reconcile state with a single payload. Confirmation is
 * a UI concern (Clear all only) — the server executes immediately.
 */
export async function DELETE(): Promise<
  NextResponse<(TasksResponse & { removed: number }) | { error: string }>
> {
  try {
    const removed = await deleteCompletedTasks();
    const tasks = await listTasksByStatus("all");
    const done = 0;
    const total = tasks.length;
    return NextResponse.json({
      removed,
      tasks,
      counts: { pending: total - done, done, total },
    });
  } catch (error) {
    console.error("DELETE /api/tasks/completed failed:", error);
    return NextResponse.json(
      { error: "Could not clear completed tasks. Please try again." },
      { status: 500 },
    );
  }
}
