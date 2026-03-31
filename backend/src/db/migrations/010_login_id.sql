-- 010_login_id.sql
-- Add login_id as the primary login credential (replaces email for authentication)

-- Add login_id column
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id VARCHAR(50);

-- Populate from email prefix for all existing users
UPDATE users SET login_id = SPLIT_PART(email, '@', 1) WHERE login_id IS NULL;

-- Fix pm_head → pmhead (cleaner login id)
UPDATE users SET login_id = 'pmhead' WHERE login_id = 'pm_head';

-- Make it unique and not null
ALTER TABLE users ADD CONSTRAINT users_login_id_key UNIQUE (login_id);
ALTER TABLE users ALTER COLUMN login_id SET NOT NULL;

-- Make email optional (login is now via login_id)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
