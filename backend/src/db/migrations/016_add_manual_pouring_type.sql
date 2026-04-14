-- Add 'Manual' to pouring_type ENUM
-- Was present in frontend/validator but missing from the DB, causing 500 on submission
ALTER TYPE pouring_type ADD VALUE IF NOT EXISTS 'Manual';
