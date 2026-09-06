"use client";

import { useEffect, useRef } from "react";

interface ConfirmClearAllDialogProps {
  open: boolean;
  taskCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for Clear all. Clear completed needs no confirmation
 * (spec); Clear all always does. Escape cancels; focus moves into the
 * dialog on open and the confirm button is focused first.
 */
export function ConfirmClearAllDialog({
  open,
  taskCount,
  onConfirm,
  onCancel,
}: ConfirmClearAllDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-all-title"
        aria-describedby="clear-all-description"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h2
          id="clear-all-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Clear all tasks?
        </h2>
        <p
          id="clear-all-description"
          className="mt-2 text-sm text-zinc-600 dark:text-zinc-400"
        >
          This permanently deletes all{" "}
          {taskCount} task{taskCount === 1 ? "" : "s"}. This cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
