"use client";

import type { Task, TaskFilter } from "@/lib/tasks/types";

export const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
];

interface FilterTabsProps {
  active: TaskFilter;
  onChange: (filter: TaskFilter) => void;
}

/**
 * All / Pending / Done tabs. The active tab is highlighted with an
 * animated underline; switching tabs never reloads the page and never
 * causes a layout jump (fixed-height tab row).
 */
export function FilterTabs({ active, onChange }: FilterTabsProps) {
  return (
    <div role="tablist" aria-label="Task filter" className="flex w-full gap-1">
      {FILTERS.map((filter) => {
        const isActive = filter.value === active;
        return (
          <button
            key={filter.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(filter.value)}
            className={`relative flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "text-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {filter.label}
            <span
              aria-hidden
              className={`absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-zinc-900 transition-opacity dark:bg-zinc-100 ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  onToggle: (id: string) => void;
}

/**
 * One task row. The checkbox is a real <input type="checkbox"> with a
 * ~44px touch target; completed tasks are struck through and muted but
 * stay readable (spec: Task Rows).
 */
export function TaskRow({ task, onToggle }: TaskRowProps) {
  return (
    <li className="flex items-center gap-3 py-1">
      <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
          aria-label={task.completed ? `Mark "${task.text}" as pending` : `Mark "${task.text}" as done`}
          className="h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-zinc-300 bg-white transition-colors checked:border-zinc-900 checked:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:checked:border-zinc-100 dark:checked:bg-zinc-100 dark:focus-visible:outline-zinc-100"
        />
        <span
          className={`min-w-0 flex-1 break-words text-base leading-snug transition-colors ${
            task.completed
              ? "text-zinc-400 line-through dark:text-zinc-500"
              : "text-zinc-800 dark:text-zinc-100"
          }`}
        >
          {task.text}
        </span>
      </label>
    </li>
  );
}

interface TaskListProps {
  tasks: Task[];
  activeFilter: TaskFilter;
  isLoading: boolean;
  onToggle: (id: string) => void;
}

const EMPTY_STATES: Record<TaskFilter, string> = {
  all: "Nothing here yet. Capture your first task above.",
  pending: "You're caught up. Nothing pending.",
  done: "No completed tasks yet.",
};

/**
 * The task list with per-filter empty states and a skeleton while the
 * initial load is in flight.
 */
export function TaskList({ tasks, activeFilter, isLoading, onToggle }: TaskListProps) {
  if (isLoading) {
    return (
      <ul className="space-y-2 py-2" aria-hidden>
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60"
          />
        ))}
      </ul>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        {EMPTY_STATES[activeFilter]}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} />
      ))}
    </ul>
  );
}
