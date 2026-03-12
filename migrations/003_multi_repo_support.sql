ALTER TABLE jobs ADD COLUMN selected_repos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE jobs ADD COLUMN pr_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_runs ADD COLUMN pr_urls JSONB DEFAULT '[]'::jsonb;
