ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS type_of_work VARCHAR(50);
