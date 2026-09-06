import { NextResponse } from "next/server";

import { setTaskCompleted } from "@/lib/tasks/store";
import type { Task } from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tasks/:id
 * Body: { completed: boolean }
 * The server sets completed_at/updated_at per the completion rules;
 * client-supplied timestamps or completion metadata are ignored.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ task: Task } | { error: string }>> {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const completed = (body as { completed?: unknown } | null)?.completed;
  if (typeof completed !== "boolean") {
    return NextResponse.json(
      { error: "'completed' must be a boolean." },
      { status: 400 },
    );
  }

  try {
    const result = await setTaskCompleted(id, completed);
    if (!result.ok) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    return NextResponse.json({ task: result.task });
  } catch (error) {
    console.error("PATCH /api/tasks/:id failed:", error);
    return NextResponse.json(
      { error: "Could not update the task. Please try again." },
      { status: 500 },
    );
  }
}
