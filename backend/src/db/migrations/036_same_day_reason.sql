-- Capture why a same-day request was not raised the previous day
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS same_day_reason TEXT;
