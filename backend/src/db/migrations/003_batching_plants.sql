-- 003_batching_plants.sql
-- Add PMManager role to enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PMManager';

-- Batching Plants table
CREATE TABLE IF NOT EXISTS batching_plants (
  plant_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plant_name VARCHAR(100) NOT NULL UNIQUE,
  active_flag BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link packages to a batching plant
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS batching_plant_id UUID REFERENCES batching_plants(plant_id);

-- PMManager ↔ Batching Plant mapping
CREATE TABLE IF NOT EXISTS user_batching_plants (
  user_id  UUID REFERENCES users(user_id) ON DELETE CASCADE,
  plant_id UUID REFERENCES batching_plants(plant_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, plant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_batching_plants_user ON user_batching_plants(user_id);
CREATE INDEX IF NOT EXISTS idx_packages_plant ON packages(batching_plant_id);
