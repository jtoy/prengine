CREATE TABLE IF NOT EXISTS job_logs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  source VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job_id ON job_logs (job_id);
CREATE INDEX idx_job_logs_created_at ON job_logs (created_at DESC);
CREATE INDEX idx_job_logs_level ON job_logs (level);
