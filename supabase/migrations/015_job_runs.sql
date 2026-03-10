-- Persistent job logging for container jobs (images, prices, tags).
-- Allows checking progress/status even when the container is sleeping.

CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,           -- 'images', 'prices', 'tags'
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_job_runs_type_started ON job_runs (job_type, started_at DESC);
