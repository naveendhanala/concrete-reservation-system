-- 032_contractor_daily_log.sql
CREATE TABLE IF NOT EXISTS contractor_daily_log (
  log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id       UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES packages(package_id),
  type_of_work        VARCHAR(50) NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  available_count     INTEGER NOT NULL CHECK (available_count >= 0),
  additional_expected INTEGER CHECK (additional_expected IS NULL OR additional_expected >= 0),
  expected_date       DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contractor_id, package_id, type_of_work, date)
);

CREATE INDEX IF NOT EXISTS idx_contractor_daily_log_contractor
  ON contractor_daily_log(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_daily_log_package
  ON contractor_daily_log(package_id);
CREATE INDEX IF NOT EXISTS idx_contractor_daily_log_date
  ON contractor_daily_log(date);

-- Migrate existing data; use created_at::date so history is preserved
INSERT INTO contractor_daily_log
  (contractor_id, package_id, type_of_work, date, available_count, additional_expected, expected_date, created_at)
SELECT
  contractor_id,
  package_id,
  type_of_work,
  created_at::date AS date,
  labour_count      AS available_count,
  additional_expected,
  expected_date,
  created_at
FROM contractor_assignments
ON CONFLICT (contractor_id, package_id, type_of_work, date) DO NOTHING;
