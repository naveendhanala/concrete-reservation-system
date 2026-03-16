-- 004_rfi_batching_plant.sql
-- Add RFI ID and Batching Plant fields to reservations

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS rfi_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS batching_plant VARCHAR(100);
