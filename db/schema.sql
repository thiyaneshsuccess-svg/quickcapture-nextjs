-- QuickCapture — PostgreSQL schema
-- Works on any Postgres: Render Postgres, Supabase, Neon, local docker, ...
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text VARCHAR(500) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);

-- Completion rules from the spec:
--   completed=true  -> completed_at = now(), updated_at = now()
--   completed=false -> completed_at = NULL,  updated_at = now()
-- Enforced in the database so any client of the table keeps the invariants.

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

DROP TRIGGER IF EXISTS trg_tasks_completion ON tasks;
CREATE TRIGGER trg_tasks_completion
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_completion_timestamps();
