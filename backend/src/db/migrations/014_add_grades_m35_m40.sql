-- Add M35 and M40 to concrete_grade ENUM
-- M35 was already shown in the UI but missing from the DB (causing submission failures)
-- M40 is a new grade being added

ALTER TYPE concrete_grade ADD VALUE IF NOT EXISTS 'M35';
ALTER TYPE concrete_grade ADD VALUE IF NOT EXISTS 'M40';
