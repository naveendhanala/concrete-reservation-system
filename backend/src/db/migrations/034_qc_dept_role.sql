-- Add QC-dept role for Quality Control department users
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'QC-dept';
