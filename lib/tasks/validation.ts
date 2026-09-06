export const MAX_TASK_TEXT_LENGTH = 500;

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
