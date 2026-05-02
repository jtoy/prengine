-- Per-repo error tracking toggles
ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS error_tracking_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS error_autofix_enabled BOOLEAN NOT NULL DEFAULT false;

-- Job source column (user, error_tracker, monitor, etc.)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'user';

-- Client errors table
CREATE TABLE IF NOT EXISTS client_errors (
  id SERIAL PRIMARY KEY,
  fingerprint VARCHAR(64) NOT NULL UNIQUE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id),
  type VARCHAR(100) NOT NULL,
  message VARCHAR(2000) NOT NULL,
  stack TEXT,
  metadata JSONB,
  error_source VARCHAR(20) NOT NULL DEFAULT 'client',
  count INTEGER NOT NULL DEFAULT 1,
  job_id INTEGER REFERENCES jobs(id),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_repo ON client_errors(repository_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_last_seen ON client_errors(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_job ON client_errors(job_id);
