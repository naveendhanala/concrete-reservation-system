-- 011_plain_password.sql
-- Store plain password for admin visibility

ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT;
