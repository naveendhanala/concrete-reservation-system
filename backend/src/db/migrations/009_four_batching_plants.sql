-- 009_four_batching_plants.sql
-- Rename existing 3 batching plants to match actual plant names,
-- add 4th plant (Camp-1 CP-30), add 4th PMManager.

-- ── 1. Rename plants to match shifts.js names ──────────────────
UPDATE batching_plants SET plant_name = 'Camp-1 M3'    WHERE plant_name = 'Batching Plant 1';
UPDATE batching_plants SET plant_name = 'Camp-2 M3'    WHERE plant_name = 'Batching Plant 2';
UPDATE batching_plants SET plant_name = 'Camp-3 M1'    WHERE plant_name = 'Batching Plant 3';

-- ── 2. Add 4th plant ───────────────────────────────────────────
INSERT INTO batching_plants (plant_name)
  VALUES ('Camp-1 CP-30')
  ON CONFLICT (plant_name) DO NOTHING;

-- ── 3. Redistribute packages across 4 plants ──────────────────
-- Camp-1 M3   → Packages 1-4  (E6, E8, E9, E13)
-- Camp-2 M3   → Packages 5-8  (N7, N10, N11, N13)
-- Camp-3 M1   → Packages 9-11 (N14, Zone 3A, Zone 4)
-- Camp-1 CP-30→ Packages 12-13 (Zone 5B, Zone 10)

UPDATE packages SET batching_plant_id = (SELECT plant_id FROM batching_plants WHERE plant_name = 'Camp-1 M3')
  WHERE package_name IN ('Package 1 - E6','Package 2 - E8','Package 3 - E9','Package 4 - E13');

UPDATE packages SET batching_plant_id = (SELECT plant_id FROM batching_plants WHERE plant_name = 'Camp-2 M3')
  WHERE package_name IN ('Package 5 - N7','Package 6 - N10','Package 7 - N11','Package 8 - N13');

UPDATE packages SET batching_plant_id = (SELECT plant_id FROM batching_plants WHERE plant_name = 'Camp-3 M1')
  WHERE package_name IN ('Package 9 - N14','Package 10 - Zone 3A','Package 11 - Zone 4');

UPDATE packages SET batching_plant_id = (SELECT plant_id FROM batching_plants WHERE plant_name = 'Camp-1 CP-30')
  WHERE package_name IN ('Package 12 - Zone 5B','Package 13 - Zone 10');

-- ── 4. Add 4th PMManager user ──────────────────────────────────
INSERT INTO users (name, role, email, password_hash)
  VALUES (
    'P&M Manager - Camp-1 CP-30',
    'PMManager',
    'pmm4@concrete.com',
    '$2a$10$TvQOoy6WBYlmuHEjai1Vu.zurjhPK3YDq2YlnA4k1WuJkP1e2XgMS'  -- bcrypt of PMM@123
  )
  ON CONFLICT (email) DO NOTHING;

-- ── 5. Link 4th PMManager to Camp-1 CP-30 ─────────────────────
INSERT INTO user_batching_plants (user_id, plant_id)
  SELECT u.user_id, bp.plant_id
  FROM users u, batching_plants bp
  WHERE u.email = 'pmm4@concrete.com'
    AND bp.plant_name = 'Camp-1 CP-30'
  ON CONFLICT DO NOTHING;

-- ── 6. Also update existing PMManagers' plant links in case plant_ids changed ─
-- (Safe to re-run: if pmm1/2/3 are already linked they will be skipped)
INSERT INTO user_batching_plants (user_id, plant_id)
  SELECT u.user_id, bp.plant_id
  FROM users u, batching_plants bp
  WHERE (u.email = 'pmm1@concrete.com' AND bp.plant_name = 'Camp-1 M3')
     OR (u.email = 'pmm2@concrete.com' AND bp.plant_name = 'Camp-2 M3')
     OR (u.email = 'pmm3@concrete.com' AND bp.plant_name = 'Camp-3 M1')
  ON CONFLICT DO NOTHING;
