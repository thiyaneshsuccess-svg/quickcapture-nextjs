"use client";

import {
  ConfirmClearAllDialog,
} from "@/components/ConfirmClearAllDialog";
import { CaptureInput } from "@/components/CaptureInput";
import {
  FilterTabs,
  TaskList,
} from "@/components/TaskList";
import { useTasks } from "@/lib/tasks/useTasks";

/**
 * QuickCapture — the single app screen. Capture input first, tabs, list,
 * counts, and the two destructive actions. All state flows through useTasks.
 */
export default function HomePage() {
  const {
    visibleTasks,
    counts,
    activeFilter,
    setActiveFilter,
    isLoading,
    isSubmitting,
    error,
    dismissError,
    confirmClearAll,
    setConfirmClearAll,
    addTask,
    toggleTask,
    clearCompleted,
    clearAll,
  } = useTasks();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          QuickCapture
        </h1>
        <p
          className="mt-1 text-sm text-zinc-500 dark:text-zinc-400"
          aria-live="polite"
        >
          {counts.pending} pending · {counts.total} total
        </p>
      </header>

      <CaptureInput onSubmit={addTask} isSubmitting={isSubmitting} />

      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-1 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/50 dark:hover:text-red-300"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : null}

      <nav className="mt-6 border-b border-zinc-200 dark:border-zinc-800">
        <FilterTabs active={activeFilter} onChange={setActiveFilter} />
      </nav>

      <section className="mt-2 flex-1">
        <TaskList
          tasks={visibleTasks}
          activeFilter={activeFilter}
          isLoading={isLoading}
          onToggle={(id) => void toggleTask(id)}
        />
      </section>

      {counts.total > 0 ? (
        <footer className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void clearCompleted()}
            disabled={counts.done === 0}
            className="min-h-11 flex-1 rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Clear completed
          </button>
          <button
            type="button"
            onClick={() => setConfirmClearAll(true)}
            className="min-h-11 flex-1 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Clear all
          </button>
        </footer>
      ) : null}

      <ConfirmClearAllDialog
        open={confirmClearAll}
        taskCount={counts.total}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClearAll(false)}
      />
    </main>
  );
}
