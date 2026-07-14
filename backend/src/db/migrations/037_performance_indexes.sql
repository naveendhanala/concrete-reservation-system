-- reservation_deliveries is queried by reservation_id from the reservation
-- detail page, delivery logs, dashboards, and reports, but only had its PK
-- index. reservations is listed ORDER BY created_at DESC on every page load.
CREATE INDEX IF NOT EXISTS idx_deliveries_reservation ON reservation_deliveries (reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservations_created ON reservations (created_at DESC);
