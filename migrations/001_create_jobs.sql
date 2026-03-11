CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_by INT,
  created_by_email VARCHAR(255),
  pr_url TEXT,
  diff_summary TEXT,
  failure_reason TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  repo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_by ON jobs(created_by);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
