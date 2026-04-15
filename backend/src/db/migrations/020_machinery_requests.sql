CREATE TABLE machinery_requests (
  request_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by   UUID NOT NULL REFERENCES users(user_id),
  package_id     UUID NOT NULL REFERENCES packages(package_id),
  machinery_name VARCHAR(200) NOT NULL,
  machinery_type VARCHAR(100),
  remarks        TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'Pending',
  completed_by   UUID REFERENCES users(user_id),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machinery_requests_pkg ON machinery_requests(package_id, status);
CREATE INDEX idx_machinery_requests_by  ON machinery_requests(requested_by);
