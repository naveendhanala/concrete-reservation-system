ALTER TABLE contractor_assignments
  ADD COLUMN IF NOT EXISTS additional_expected INTEGER CHECK (additional_expected IS NULL OR additional_expected >= 0),
  ADD COLUMN IF NOT EXISTS expected_date DATE;
