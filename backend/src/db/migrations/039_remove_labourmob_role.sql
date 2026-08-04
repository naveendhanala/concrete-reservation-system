-- Remove the Daily Log feature (table from 032) and the LabourMob role
-- (introduced in 017) entirely. Postgres cannot drop a single enum value,
-- so the type is recreated without it. Any users with role = 'LabourMob'
-- must be deleted or reassigned before running this migration.
DROP TABLE IF EXISTS contractor_daily_log;

ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('PM','ClusterHead','VP','PMHead','Admin','PMManager','Engineer','QC-dept');
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role;
DROP TYPE user_role_old;
