// src/routes/report.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// SLA performance report
router.get('/sla', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await query(
    `SELECT
       DATE(r.requested_start) AS date,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COUNT(*) FILTER (WHERE r.status = 'Completed' AND r.completed_at <= r.requested_end) AS on_time,
       COALESCE(SUM(r.quantity_m3), 0) AS total_requested_m3,
       COALESCE(SUM(r.actual_quantity_m3) FILTER (WHERE r.status = 'Completed'), 0) AS total_actual_m3
     FROM reservations r
     WHERE ($1::date IS NULL OR DATE(r.requested_start) >= $1)
       AND ($2::date IS NULL OR DATE(r.requested_start) <= $2)
     GROUP BY DATE(r.requested_start)
     ORDER BY date`,
    [from || null, to || null]
  );
  res.json(rows);
}));

// Utilization report
router.get('/utilization', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await query(
    `SELECT s.slot_date, s.start_time,
       s.capacity_m3,
       COALESCE(SUM(rsm.allocated_m3), 0) AS booked_m3,
       ROUND(COALESCE(SUM(rsm.allocated_m3), 0) / s.capacity_m3 * 100, 1) AS utilization_pct
     FROM slots s
     LEFT JOIN reservation_slot_mappings rsm ON s.slot_id = rsm.slot_id
     LEFT JOIN reservations r ON rsm.reservation_id = r.reservation_id AND r.status NOT IN ('Rejected','Cancelled')
     WHERE ($1::date IS NULL OR s.slot_date >= $1)
       AND ($2::date IS NULL OR s.slot_date <= $2)
     GROUP BY s.slot_id, s.slot_date, s.start_time, s.capacity_m3
     ORDER BY s.slot_date, s.start_time`,
    [from || null, to || null]
  );
  res.json(rows);
}));

// Package-wise quantity summary
router.get('/packages', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await query(
    `SELECT pkg.package_name,
       COUNT(r.reservation_id) AS total,
       COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COALESCE(SUM(r.quantity_m3), 0) AS total_requested_m3,
       COALESCE(SUM(r.actual_quantity_m3) FILTER (WHERE r.status = 'Completed'), 0) AS total_actual_m3
     FROM packages pkg
     LEFT JOIN reservations r ON pkg.package_id = r.package_id
       AND ($1::date IS NULL OR DATE(r.requested_start) >= $1)
       AND ($2::date IS NULL OR DATE(r.requested_start) <= $2)
     GROUP BY pkg.package_id, pkg.package_name
     ORDER BY total_requested_m3 DESC`,
    [from || null, to || null]
  );
  res.json(rows);
}));

// Audit log
router.get('/audit', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { entity, userId, from, to } = req.query;
  const { rows } = await query(
    `SELECT al.*, u.name AS user_name
     FROM audit_logs al LEFT JOIN users u ON al.user_id = u.user_id
     WHERE ($1::text IS NULL OR al.entity_name = $1)
       AND ($2::uuid IS NULL OR al.user_id = $2)
       AND ($3::date IS NULL OR DATE(al.created_at) >= $3)
       AND ($4::date IS NULL OR DATE(al.created_at) <= $4)
     ORDER BY al.created_at DESC LIMIT 500`,
    [entity || null, userId || null, from || null, to || null]
  );
  res.json(rows);
}));

module.exports = router;
