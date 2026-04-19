-- Add same-day freebie tracking to reservations and config
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS same_day_freebie BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO config (key, value, description)
  VALUES ('same_day_freebie_limit', '3', 'Max same-day freebies allowed per package per day')
  ON CONFLICT (key) DO NOTHING;
