export const MAX_TASK_TEXT_LENGTH = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TextValidationResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Validates raw task text from an untrusted source (client or HTTP body).
 * Trims whitespace, rejects empty text, and enforces the 500-character cap.
 */
export function validateTaskText(input: unknown): TextValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Task text must be a string." };
  }

  const text = input.trim();

  if (text.length === 0) {
    return { ok: false, error: "Task text is required." };
  }

  if (text.length > MAX_TASK_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Task text must be ${MAX_TASK_TEXT_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, text };
}

export type ImportedTaskValidation =
  | {
      ok: true;
      id: string;
      text: string;
      completed: boolean;
      created_at: string;
      completed_at: string | null;
      updated_at: string;
    }
  | { ok: false };

/**
 * Validates a single task object from a backup file (untrusted input).
 * Ids must be UUIDs, text must pass the normal task rules, and timestamps
 * must parse. Rather than rejecting rows whose completed_at disagrees with
 * the completed flag, the value is repaired (pending -> null, completed
 * without a timestamp -> updated_at) so slightly-off backups still restore.
 */
export function validateImportedTask(
  input: unknown,
): ImportedTaskValidation | { ok: false } {
  if (typeof input !== "object" || input === null) return { ok: false };
  const row = input as Record<string, unknown>;

  if (typeof row.id !== "string" || !UUID_RE.test(row.id)) return { ok: false };
  const textCheck = validateTaskText(row.text);
  if (!textCheck.ok) return { ok: false };

  const completed = row.completed === true;
  const created = new Date(typeof row.created_at === "string" ? row.created_at : "");
  const updated = new Date(typeof row.updated_at === "string" ? row.updated_at : "");
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) {
    return { ok: false };
  }

  let completedAt: string | null = null;
  if (row.completed_at !== null && row.completed_at !== undefined) {
    const parsed = new Date(String(row.completed_at));
    if (Number.isNaN(parsed.getTime())) return { ok: false };
    completedAt = parsed.toISOString();
  }

  return {
    ok: true,
    id: row.id,
    text: textCheck.text,
    completed,
    created_at: created.toISOString(),
    completed_at: completed ? (completedAt ?? updated.toISOString()) : null,
    updated_at: updated.toISOString(),
  };
}
