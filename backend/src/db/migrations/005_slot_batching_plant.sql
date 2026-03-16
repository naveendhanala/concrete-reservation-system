-- 005_slot_batching_plant.sql
-- Split slot capacity per batching plant.
-- Each slot is now unique per (slot_date, start_time, batching_plant).

ALTER TABLE slots ADD COLUMN IF NOT EXISTS batching_plant VARCHAR(100);

-- Drop the old (slot_date, start_time) unique constraint (created in 002)
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_slot_date_start_time_key;

-- New unique constraint includes the plant
ALTER TABLE slots
  ADD CONSTRAINT slots_slot_date_start_time_plant_key
  UNIQUE (slot_date, start_time, batching_plant);
