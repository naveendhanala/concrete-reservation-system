CREATE TABLE IF NOT EXISTS reservation_deliveries (
  delivery_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(reservation_id) ON DELETE CASCADE,
  quantity_m3   NUMERIC(10,2) NOT NULL,
  delivered_by  UUID NOT NULL REFERENCES users(user_id),
  notes         TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
