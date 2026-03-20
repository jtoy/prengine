CREATE TABLE IF NOT EXISTS directors_plans (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  share_hash VARCHAR(32) UNIQUE NOT NULL,
  created_by INT,
  created_by_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS directors_plan_scenes (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES directors_plans(id) ON DELETE CASCADE,
  scene_number INT NOT NULL,
  title VARCHAR(500),
  description TEXT,
  sketch_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_directors_plans_share_hash ON directors_plans(share_hash);
CREATE INDEX idx_directors_plan_scenes_plan_id ON directors_plan_scenes(plan_id);
CREATE INDEX idx_directors_plan_scenes_order ON directors_plan_scenes(plan_id, scene_number);
