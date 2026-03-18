CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  base_branch TEXT NOT NULL DEFAULT 'main',
  description TEXT DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
