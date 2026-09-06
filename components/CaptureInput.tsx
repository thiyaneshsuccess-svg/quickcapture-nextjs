"use client";

import { useRef, useState } from "react";

import { MAX_TASK_TEXT_LENGTH } from "@/lib/tasks/validation";

interface CaptureInputProps {
  onSubmit: (text: string) => Promise<{ ok: boolean; error?: string }>;
  isSubmitting: boolean;
}

/**
 * The always-visible capture field — the strongest visual element on the
 * page (spec: input stays near the top, ~56-64px tall, rounded, Enter
 * submits). Empty or whitespace-only input does nothing.
 */
export function CaptureInput({ onSubmit, isSubmitting }: CaptureInputProps) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (text.length === 0) return; // Enter on empty input does nothing.

    if (text.length > MAX_TASK_TEXT_LENGTH) {
      setLocalError(`Tasks are limited to ${MAX_TASK_TEXT_LENGTH} characters.`);
      return;
    }

    const result = await onSubmit(text);
    if (!result.ok) {
      setLocalError(result.error ?? "Could not save the task.");
      return;
    }

    // Success: clear and stay ready for the next capture (spec flow).
    setValue("");
    setLocalError(null);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate aria-busy={isSubmitting}>
      <label htmlFor="capture-input" className="sr-only">
        New task
      </label>
      <input
        id="capture-input"
        ref={inputRef}
        type="text"
        inputMode="text"
        enterKeyHint="done"
        autoComplete="off"
        maxLength={MAX_TASK_TEXT_LENGTH + 1}
        placeholder="What do you want to remember?"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (localError) setLocalError(null);
        }}
        aria-invalid={localError ? true : undefined}
        aria-describedby={localError ? "capture-error" : undefined}
        className="h-16 w-full rounded-2xl border border-zinc-200 bg-white px-5 text-lg text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
      />
      {localError ? (
        <p
          id="capture-error"
          role="alert"
          className="mt-2 px-1 text-sm text-red-600 dark:text-red-400"
        >
          {localError}
        </p>
      ) : null}
    </form>
  );
}
