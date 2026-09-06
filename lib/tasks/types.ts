/**
 * The canonical Task object, matching the spec:
 * { id, text, completed, created_at, completed_at, updated_at }
 */
export interface Task {
  id: string;
  text: string;
  completed: boolean;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp, or null while the task is pending */
  completed_at: string | null;
  /** ISO 8601 timestamp */
  updated_at: string;
}

export type TaskFilter = "all" | "pending" | "done";

/** Payload shape returned by GET /api/tasks (and the mutating endpoints). */
export interface TasksResponse {
  tasks: Task[];
  counts: { pending: number; done: number; total: number };
}
