-- 001_initial_schema.sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CONFIG TABLE (app-wide settings)
-- ============================================================
CREATE TABLE config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PACKAGES / PROJECTS
-- ============================================================
CREATE TABLE packages (
  package_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_name VARCHAR(200) NOT NULL UNIQUE,
  active_flag BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TYPE user_role AS ENUM ('PM', 'ClusterHead', 'VP', 'PMHead', 'Admin');

CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  role user_role NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  active_flag BOOLEAN DEFAULT TRUE,
  same_day_request_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Package mapping (PM: 1 package, ClusterHead: many packages)
CREATE TABLE user_packages (
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(package_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, package_id)
);

-- ============================================================
-- CONTRACTORS & SITE ENGINEERS
-- ============================================================
CREATE TABLE contractors (
  contractor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  contact VARCHAR(20),
  active_flag BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE site_engineers (
  engineer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  contact VARCHAR(20) NOT NULL,
  package_id UUID REFERENCES packages(package_id),
  active_flag BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSIT MIXERS
-- ============================================================
CREATE TABLE transit_mixers (
  mixer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_number VARCHAR(50) NOT NULL UNIQUE,
  capacity_m3 NUMERIC(6,2) NOT NULL DEFAULT 6.0,
  active_flag BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SLOTS (production time slots)
-- ============================================================
CREATE TABLE slots (
  slot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  capacity_m3 NUMERIC(8,2) NOT NULL,
  booked_m3 NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (slot_date, start_time)
);

-- Index for fast slot availability queries
CREATE INDEX idx_slots_date ON slots(slot_date);
CREATE INDEX idx_slots_date_active ON slots(slot_date, is_active);

-- ============================================================
-- RESERVATIONS
-- ============================================================
CREATE TYPE concrete_grade AS ENUM ('M15', 'M20', 'M25', 'M30', 'M30_SRC', 'M45');
CREATE TYPE pouring_type AS ENUM ('BoomPlacer', 'ConcretePump', 'Chute');
CREATE TYPE reservation_status AS ENUM (
  'Draft', 'Submitted', 'Acknowledged', 'Rejected',
  'Completed', 'Cancelled', 'PendingApproval'
);

CREATE TABLE reservations (
  reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_number VARCHAR(20) UNIQUE,  -- Human readable: RES-20240601-001
  requester_id UUID NOT NULL REFERENCES users(user_id),
  package_id UUID NOT NULL REFERENCES packages(package_id),
  quantity_m3 NUMERIC(8,2) NOT NULL,
  grade concrete_grade NOT NULL,
  structure VARCHAR(200) NOT NULL,
  chainage VARCHAR(100) NOT NULL,
  nature_of_work TEXT NOT NULL,
  pouring_type pouring_type NOT NULL,
  site_engineer_id UUID REFERENCES site_engineers(engineer_id),
  contractor_id UUID REFERENCES contractors(contractor_id),
  priority_flag VARCHAR(20) DEFAULT 'Normal', -- Normal / HighPriority / SameDay
  status reservation_status NOT NULL DEFAULT 'Draft',
  requested_start TIMESTAMPTZ NOT NULL,
  requested_end TIMESTAMPTZ NOT NULL,
  acknowledged_start TIMESTAMPTZ,
  acknowledged_end TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(user_id),
  acknowledged_at TIMESTAMPTZ,
  cutoff_applicable BOOLEAN DEFAULT TRUE,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  is_split BOOLEAN DEFAULT FALSE,
  parent_reservation_id UUID REFERENCES reservations(reservation_id),
  version INTEGER DEFAULT 1,
  actual_quantity_m3 NUMERIC(8,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservations_requester ON reservations(requester_id);
CREATE INDEX idx_reservations_package ON reservations(package_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_date ON reservations(requested_start);

-- ============================================================
-- RESERVATION-SLOT MAPPING (supports auto-split)
-- ============================================================
CREATE TABLE reservation_slot_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(slot_id),
  allocated_m3 NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reservation_id, slot_id)
);

-- ============================================================
-- APPROVAL WORKFLOWS
-- ============================================================
CREATE TYPE approval_type AS ENUM ('SameDay', 'PriorityOverride', 'PostCutoffChange', 'CapacityBreach');
CREATE TYPE approval_status AS ENUM ('Pending', 'Approved', 'Rejected');

CREATE TABLE approval_workflows (
  approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id),
  approver_id UUID NOT NULL REFERENCES users(user_id),
  approval_type approval_type NOT NULL,
  status approval_status NOT NULL DEFAULT 'Pending',
  remarks TEXT,
  sla_due_at TIMESTAMPTZ NOT NULL,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_approver ON approval_workflows(approver_id, status);
CREATE INDEX idx_approvals_reservation ON approval_workflows(reservation_id);

-- ============================================================
-- BATCH ASSIGNMENTS (dispatch tracking)
-- ============================================================
CREATE TYPE trip_status AS ENUM ('Assigned', 'Departed', 'OnSite', 'Completed');

CREATE TABLE batch_assignments (
  batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id),
  mixer_id UUID REFERENCES transit_mixers(mixer_id),
  quantity_m3 NUMERIC(6,2),
  dispatch_time TIMESTAMPTZ,
  eta TIMESTAMPTZ,
  actual_arrival_time TIMESTAMPTZ,
  actual_return_time TIMESTAMPTZ,
  trip_status trip_status NOT NULL DEFAULT 'Assigned',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TYPE notification_channel AS ENUM ('Email', 'InApp');
CREATE TYPE notification_status AS ENUM ('Pending', 'Sent', 'Failed');

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(user_id),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channel notification_channel NOT NULL,
  status notification_status DEFAULT 'Pending',
  reservation_id UUID REFERENCES reservations(reservation_id),
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(user_id),
  entity_name VARCHAR(100) NOT NULL,
  entity_id UUID,
  action VARCHAR(20) NOT NULL,  -- Create / Update / Delete
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- RESERVATION CHANGE HISTORY
-- ============================================================
CREATE TABLE reservation_history (
  history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id),
  changed_by UUID NOT NULL REFERENCES users(user_id),
  change_type VARCHAR(50) NOT NULL,  -- StatusChange / QuantityChange / SlotChange / Cancellation
  reason_code VARCHAR(100),
  reason_text TEXT,
  snapshot JSONB,  -- Full reservation state at time of change
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_reservation ON reservation_history(reservation_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_packages_updated_at BEFORE UPDATE ON packages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_slots_updated_at BEFORE UPDATE ON slots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batch_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate reservation number
CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num
  FROM reservations
  WHERE DATE(created_at) = CURRENT_DATE;
  
  NEW.reservation_number = 'RES-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_number
BEFORE INSERT ON reservations
FOR EACH ROW EXECUTE FUNCTION generate_reservation_number();
