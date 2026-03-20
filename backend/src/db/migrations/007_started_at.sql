-- 007_started_at.sql
-- Add started_at timestamp to track when PM clicks START
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
