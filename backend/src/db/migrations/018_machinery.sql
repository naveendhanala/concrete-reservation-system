CREATE TABLE machinery (
  machinery_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  type          VARCHAR(100),
  assigned_to   UUID REFERENCES packages(package_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
