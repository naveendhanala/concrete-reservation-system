-- Widen chainage and structure columns to TEXT to support long multi-part entries
-- Previously chainage VARCHAR(100) caused "value too long" errors for entries like
-- "1)0+435.91-MH60(LHS)-Slab 2)0+455.91-MH60(RHS)-Slab ..."
ALTER TABLE reservations
  ALTER COLUMN chainage TYPE TEXT,
  ALTER COLUMN structure TYPE TEXT;
