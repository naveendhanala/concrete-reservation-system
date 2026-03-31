-- 012_engineer_role.sql
-- Add Engineer as a user role and link reservations to engineer users

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Engineer';

-- New column: engineer as a user (replaces site_engineer_id going forward)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS engineer_user_id UUID REFERENCES users(user_id);
