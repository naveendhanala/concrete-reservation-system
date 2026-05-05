-- Contractor assignments: a contractor can supply labour for multiple
-- (package, type_of_work) combinations, each with its own labour_count.
CREATE TABLE IF NOT EXISTS contractor_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  package_id    UUID NOT NULL REFERENCES packages(package_id),
  type_of_work  VARCHAR(50) NOT NULL,
  labour_count  INTEGER NOT NULL CHECK (labour_count >= 0),
  active_flag   BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contractor_id, package_id, type_of_work)
);

CREATE INDEX IF NOT EXISTS idx_contractor_assignments_contractor
  ON contractor_assignments(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_assignments_package
  ON contractor_assignments(package_id);
