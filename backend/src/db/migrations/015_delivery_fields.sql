ALTER TABLE reservation_deliveries RENAME COLUMN notes TO tm_no;
ALTER TABLE reservation_deliveries ADD COLUMN IF NOT EXISTS driver_no TEXT NOT NULL DEFAULT '';
ALTER TABLE reservation_deliveries ADD COLUMN IF NOT EXISTS batching_plant TEXT NOT NULL DEFAULT '';
