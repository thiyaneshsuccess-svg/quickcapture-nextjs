-- QuickCapture — PostgreSQL schema (Supabase-ready)
-- Run this in the Supabase SQL editor (or psql) to provision the database.
-- After that, swap lib/tasks/store.ts for the Supabase client implementation
-- (see README "Upgrading to Postgres/Supabase").

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text VARCHAR(500) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_completed ON tasks (completed);
CREATE INDEX idx_tasks_created_at ON tasks (created_at DESC);

-- Completion rules from the spec:
--   completed=true  -> completed_at = now(), updated_at = now()
--   completed=false -> completed_at = NULL,  updated_at = now()
-- Enforced here so any client of the table keeps the invariants.

CREATE OR REPLACE FUNCTION set_task_completion_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed THEN
    NEW.completed_at := NOW();
  ELSE
    NEW.completed_at := NULL;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_completion
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_completion_timestamps();
