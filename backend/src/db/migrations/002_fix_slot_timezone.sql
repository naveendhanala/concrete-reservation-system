-- 002_fix_slot_timezone.sql
-- Fixes slot_date, start_time, end_time being stored as TIMESTAMPTZ
-- which causes UTC offset corruption (e.g. IST midnight → previous day UTC)
-- Solution: store slot_date as DATE, times as TIMESTAMP (no timezone)

-- Step 1: Add new columns with correct types
ALTER TABLE slots
  ADD COLUMN slot_date_new DATE,
  ADD COLUMN start_time_new TIMESTAMP,
  ADD COLUMN end_time_new   TIMESTAMP;

-- Step 2: Cast existing UTC-shifted values back to local (IST = UTC+5:30)
UPDATE slots SET
  slot_date_new  = (slot_date  AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::DATE,
  start_time_new = (start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::TIMESTAMP,
  end_time_new   = (end_time   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::TIMESTAMP;

-- Step 3: Drop old columns and rename new ones
ALTER TABLE slots DROP COLUMN slot_date;
ALTER TABLE slots DROP COLUMN start_time;
ALTER TABLE slots DROP COLUMN end_time;

ALTER TABLE slots RENAME COLUMN slot_date_new  TO slot_date;
ALTER TABLE slots RENAME COLUMN start_time_new TO start_time;
ALTER TABLE slots RENAME COLUMN end_time_new   TO end_time;

-- Step 4: Re-add NOT NULL + unique constraint
ALTER TABLE slots ALTER COLUMN slot_date  SET NOT NULL;
ALTER TABLE slots ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE slots ALTER COLUMN end_time   SET NOT NULL;

ALTER TABLE slots ADD CONSTRAINT slots_slot_date_start_time_key UNIQUE (slot_date, start_time);

-- Step 5: Re-add indexes
CREATE INDEX IF NOT EXISTS idx_slots_date        ON slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_date_active ON slots(slot_date, is_active);