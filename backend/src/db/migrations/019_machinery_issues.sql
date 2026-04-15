CREATE TABLE machinery_issues (
  issue_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machinery_id       UUID NOT NULL REFERENCES machinery(machinery_id) ON DELETE CASCADE,
  raised_by          UUID NOT NULL REFERENCES users(user_id),
  remarks            TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'Open',
  resolved_by        UUID REFERENCES users(user_id),
  resolved_at        TIMESTAMPTZ,
  resolution_remarks TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machinery_issues_machinery ON machinery_issues(machinery_id, status);
