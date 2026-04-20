ALTER TABLE packages ADD COLUMN IF NOT EXISTS skip_same_day_approval BOOLEAN DEFAULT FALSE;

UPDATE packages SET skip_same_day_approval = TRUE WHERE package_name = 'Misc';
