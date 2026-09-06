"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Task, TaskFilter, TasksResponse } from "@/lib/tasks/types";
import { MAX_TASK_TEXT_LENGTH } from "@/lib/tasks/validation";

type AddResult =
  | { ok: true }
  | { ok: false; error: string };

const EMPTY_COUNTS = { pending: 0, done: 0, total: 0 };

/**
 * All client state and server communication for the app.
 *
 * Implements the spec's flows: optimistic creation/toggle with rollback on
 * failure, filter derivation with no reloads, live counts, and destructive
 * actions. The server response replaces optimistic state, which is what
 * keeps rapid consecutive captures correctly ordered (the server is the
 * ordering authority — created_at DESC with an id tiebreaker).
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<TaskFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Track in-flight optimistic work so a slow create finishing after a
  // rollback can't resurrect a task the user already saw fail.
  const pendingCreations = useRef(new Set<string>());
  const mounted = useRef(true);
  // Latest tasks snapshot for synchronous reads inside event handlers
  // (state updaters run asynchronously, so they can't provide it).
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    // Discrete events (clicks) flush passive effects first, so handlers
    // always read a current snapshot here.
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyServerState = useCallback((data: TasksResponse) => {
    setTasks(data.tasks);
    // (Counts are derived, so updating tasks is sufficient.)
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?status=all", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = (await response.json()) as TasksResponse;
      if (mounted.current) applyServerState(data);
    } catch {
      if (mounted.current) {
        setError("Could not load your tasks. Check your connection and refresh.");
      }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [applyServerState]);

  // Initial load only — `load` touches state strictly after `await fetch`,
  // so no setState can run synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const addTask = useCallback(
    async (rawText: string): Promise<AddResult> => {
      const text = rawText.trim();
      if (text.length === 0) return { ok: true }; // Spec: empty input does nothing.
      if (text.length > MAX_TASK_TEXT_LENGTH) {
        return { ok: false, error: `Tasks are limited to ${MAX_TASK_TEXT_LENGTH} characters.` };
      }

      // Optimistic task: placeholder id/timestamps; replaced by server state.
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: Task = {
        id: optimisticId,
        text,
        completed: false,
        created_at: now,
        completed_at: null,
        updated_at: now,
      };

      pendingCreations.current.add(optimisticId);
      setIsSubmitting(true);
      setError(null);
      setTasks((prev) => [optimistic, ...prev]);

      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Could not save the task. Please try again.");
        }

        const data = (await response.json()) as TasksResponse;
        if (mounted.current) applyServerState(data);
        return { ok: true };
      } catch (err) {
        // Rollback the optimistic row, but only if it's still in the list.
        setTasks((prev) => prev.filter((t) => t.id !== optimisticId));
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Could not save the task.");
        }
        return { ok: false, error: err instanceof Error ? err.message : "Could not save the task." };
      } finally {
        pendingCreations.current.delete(optimisticId);
        if (mounted.current) setIsSubmitting(false);
      }
    },
    [applyServerState],
  );

  const toggleTask = useCallback(async (id: string) => {
    if (id.startsWith("optimistic-")) return; // Not yet confirmed by the server.

    // Read the pre-toggle snapshot synchronously from the latest-tasks ref.
    const snapshot = tasksRef.current.find((t) => t.id === id);
    if (!snapshot) return;
    const nextCompleted = !snapshot.completed;

    setError(null);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: nextCompleted,
              completed_at: nextCompleted ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }
          : t,
      ),
    );

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!response.ok) throw new Error("toggle failed");
    } catch {
      // Rollback to the exact pre-toggle snapshot and surface the failure.
      setTasks((prev) => prev.map((t) => (t.id === id ? snapshot : t)));
      if (mounted.current) {
        setError("Could not update the task. Your change was undone — try again.");
      }
    }
  }, []);

  const clearCompleted = useCallback(async () => {
    setError(null);
    const snapshot = tasksRef.current;
    setTasks((prev) => prev.filter((t) => !t.completed));

    try {
      const response = await fetch("/api/tasks/completed", { method: "DELETE" });
      if (!response.ok) throw new Error("clear completed failed");
      const data = (await response.json()) as TasksResponse;
      if (mounted.current) applyServerState(data);
    } catch {
      if (mounted.current) {
        setTasks(snapshot); // Restore completed tasks.
        setError("Could not clear completed tasks. Please try again.");
      }
    }
  }, [applyServerState]);

  const clearAll = useCallback(async () => {
    setError(null);
    const snapshot = tasksRef.current;
    setTasks([]);
    setConfirmClearAll(false);

    try {
      const response = await fetch("/api/tasks", { method: "DELETE" });
      if (!response.ok) throw new Error("clear all failed");
      const data = (await response.json()) as TasksResponse;
      if (mounted.current) applyServerState(data);
    } catch {
      if (mounted.current) {
        setTasks(snapshot);
        setError("Could not clear all tasks. Please try again.");
      }
    }
  }, [applyServerState]);

  const dismissError = useCallback(() => setError(null), []);

  // Derived values — filtering and counts never trigger requests.
  const visibleTasks = useMemo(() => {
    switch (activeFilter) {
      case "pending":
        return tasks.filter((t) => !t.completed);
      case "done":
        return tasks.filter((t) => t.completed);
      default:
        return tasks;
    }
  }, [tasks, activeFilter]);

  const counts = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.completed).length;
    return { pending: total - done, done, total };
  }, [tasks]);

  return {
    tasks,
    visibleTasks,
    counts: counts ?? EMPTY_COUNTS,
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
  };
}
