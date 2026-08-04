// src/routes/report.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// "Pour date" logic: slots 00:00–04:59 IST belong to the PREVIOUS calendar day.
// Achieved by subtracting 5 hours from the IST wall-clock time before extracting the date.
const POUR_DATE = `DATE((r.requested_start AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')`;

// Resolve the effective package_id filter: PMs are always scoped to their own package.
async function resolvePackageId(req) {
  if (req.user.role === 'PM') {
    const { rows } = await query(
      'SELECT package_id FROM user_packages WHERE user_id = $1 LIMIT 1',
      [req.user.user_id]
    );
    return rows[0]?.package_id || null;
  }
  return req.query.package_id || null;
}

// SLA performance report
router.get('/sla', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);
  const { rows } = await query(
    `WITH reservation_stats AS (
       SELECT
         ${POUR_DATE} AS date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed')) AS completed,
         COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed') AND r.completed_at <= r.requested_end) AS on_time,
         COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3
       FROM reservations r
       WHERE ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY ${POUR_DATE}
     ),
     delivery_stats AS (
       SELECT
         DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') AS date,
         COALESCE(SUM(d.quantity_m3), 0) AS total_actual_m3
       FROM reservation_deliveries d
       JOIN reservations r ON d.reservation_id = r.reservation_id
       WHERE ($4::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $4)
         AND ($5::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $5)
         AND ($6::uuid IS NULL OR r.package_id = $6)
       GROUP BY DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours')
     )
     SELECT
       COALESCE(rs.date, ds.date)              AS date,
       COALESCE(rs.total, 0)                   AS total,
       COALESCE(rs.completed, 0)               AS completed,
       COALESCE(rs.cancelled, 0)               AS cancelled,
       COALESCE(rs.on_time, 0)                 AS on_time,
       COALESCE(rs.total_requested_m3, 0)      AS total_requested_m3,
       COALESCE(ds.total_actual_m3, 0)         AS total_actual_m3
     FROM reservation_stats rs
     FULL OUTER JOIN delivery_stats ds ON rs.date = ds.date
     ORDER BY date`,
    [from || null, to || null, packageId, from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Utilization report (slot-based — no pour-date shift needed)
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
  const packageId = await resolvePackageId(req);
  const { rows } = await query(
    `WITH delivery_actuals AS (
       SELECT r.package_id,
         COALESCE(SUM(d.quantity_m3), 0) AS total_actual_m3
       FROM reservation_deliveries d
       JOIN reservations r ON d.reservation_id = r.reservation_id
       WHERE ($1::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $1)
         AND ($2::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY r.package_id
     )
     SELECT pkg.package_name,
       COUNT(r.reservation_id) AS total,
       COUNT(*) FILTER (WHERE r.status IN ('Completed','Auto-completed')) AS completed,
       COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
       COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.status NOT IN ('Cancelled', 'Rejected', 'Draft')), 0) AS total_requested_m3,
       COALESCE(da.total_actual_m3, 0) AS total_actual_m3
     FROM packages pkg
     LEFT JOIN reservations r ON pkg.package_id = r.package_id
       AND ($4::date IS NULL OR ${POUR_DATE} >= $4)
       AND ($5::date IS NULL OR ${POUR_DATE} <= $5)
     LEFT JOIN delivery_actuals da ON da.package_id = pkg.package_id
     WHERE ($6::uuid IS NULL OR pkg.package_id = $6)
     GROUP BY pkg.package_id, pkg.package_name, da.total_actual_m3
     ORDER BY total_requested_m3 DESC`,
    [from || null, to || null, packageId, from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Daily pour report — PMHead, PMManager, PM, Admin, ClusterHead, VP
router.get('/daily', requireRole('PMHead', 'PMManager', 'PM', 'Admin', 'ClusterHead', 'VP'), asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new AppError('date query param is required (YYYY-MM-DD)', 400);

  const packageId = await resolvePackageId(req);

  const { rows } = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY r.requested_start) AS sr_no,
       ${POUR_DATE}                                    AS date,
       COALESCE(c.name, '')                            AS contractor,
       r.chainage,
       p.package_name,
       r.grade,
       r.quantity_m3,
       r.actual_quantity_m3,
       r.structure,
       r.nature_of_work,
       COALESCE(r.rfi_id, '')                          AS rfi_id,
       COALESCE(
         STRING_AGG(DISTINCT d.tm_no, ', ')
           FILTER (WHERE d.tm_no IS NOT NULL AND d.tm_no <> ''),
         ''
       )                                               AS tm_nos,
       COALESCE(
         STRING_AGG(DISTINCT d.batching_plant, ', ')
           FILTER (WHERE d.batching_plant IS NOT NULL AND d.batching_plant <> ''),
         ''
       )                                               AS batching_plants
     FROM reservations r
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     JOIN  packages p        ON r.package_id    = p.package_id
     LEFT JOIN reservation_deliveries d ON d.reservation_id = r.reservation_id
     WHERE ${POUR_DATE} = $1::date
       AND r.status NOT IN ('Draft', 'Cancelled', 'Rejected')
       AND ($2::uuid IS NULL OR r.package_id = $2::uuid)
     GROUP BY r.reservation_id, c.name, p.package_name
     ORDER BY r.requested_start`,
    [date, packageId]
  );
  res.json(rows);
}));

// Delivery log report — PMHead, PMManager, PM, Admin, ClusterHead, VP
router.get('/deliveries', requireRole('PMHead', 'PMManager', 'PM', 'Admin', 'ClusterHead', 'VP'), asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);

  const { rows } = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY d.delivered_at) AS sr_no,
       (d.delivered_at AT TIME ZONE 'Asia/Kolkata')  AS delivered_at,
       r.reservation_number,
       COALESCE(c.name, '')                           AS contractor,
       r.chainage,
       p.package_name,
       r.grade,
       r.structure,
       r.nature_of_work,
       COALESCE(r.rfi_id, '')                         AS rfi_id,
       d.quantity_m3,
       d.tm_no,
       d.driver_no,
       d.batching_plant,
       u.name                                         AS logged_by
     FROM reservation_deliveries d
     JOIN reservations r     ON d.reservation_id  = r.reservation_id
     JOIN packages p         ON r.package_id      = p.package_id
     LEFT JOIN contractors c ON r.contractor_id   = c.contractor_id
     JOIN users u            ON d.delivered_by    = u.user_id
     WHERE ($1::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') >= $1)
       AND ($2::date IS NULL OR DATE((d.delivered_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '7 hours') <= $2)
       AND ($3::uuid IS NULL OR r.package_id = $3)
     ORDER BY d.delivered_at`,
    [from || null, to || null, packageId]
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

// Same-day trends — count and volume of SameDay-flagged reservations per day
router.get('/same-day-trends', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);

  const [{ rows }, { rows: summaryRows }, { rows: packageRows }] = await Promise.all([
    // Daily breakdown
    query(
      `SELECT
         ${POUR_DATE}                        AS date,
         COUNT(*)                            AS count,
         COALESCE(SUM(r.quantity_m3), 0)    AS volume_m3
       FROM reservations r
       WHERE r.priority_flag = 'SameDay'
         AND r.status != 'Draft'
         AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY ${POUR_DATE}
       ORDER BY ${POUR_DATE}`,
      [from || null, to || null, packageId]
    ),
    // Summary KPIs (all reservations in range for % calculation)
    query(
      `SELECT
         COUNT(*) FILTER (WHERE r.priority_flag = 'SameDay' AND r.status != 'Draft')          AS total_same_day,
         COALESCE(
           SUM(r.quantity_m3) FILTER (WHERE r.priority_flag = 'SameDay' AND r.status != 'Draft'),
           0
         )                                                                                      AS total_volume_m3,
         COUNT(*) FILTER (WHERE r.status != 'Draft')                                           AS total_all
       FROM reservations r
       WHERE ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)`,
      [from || null, to || null, packageId]
    ),
    // Package-level breakdown
    query(
      `SELECT
         p.package_name,
         COUNT(*) FILTER (WHERE r.priority_flag = 'SameDay')           AS same_day_count,
         COALESCE(SUM(r.quantity_m3) FILTER (WHERE r.priority_flag = 'SameDay'), 0) AS same_day_volume_m3,
         COUNT(*)                                                        AS total_count
       FROM reservations r
       JOIN packages p ON r.package_id = p.package_id
       WHERE r.status != 'Draft'
         AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
         AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
         AND ($3::uuid IS NULL OR r.package_id = $3)
       GROUP BY p.package_id, p.package_name
       HAVING COUNT(*) FILTER (WHERE r.priority_flag = 'SameDay') > 0
       ORDER BY same_day_count DESC`,
      [from || null, to || null, packageId]
    ),
  ]);

  const s = summaryRows[0];
  const totalAll = parseInt(s.total_all) || 0;
  const totalSameDay = parseInt(s.total_same_day) || 0;

  res.json({
    rows,
    summary: {
      total_same_day: totalSameDay,
      total_volume_m3: parseFloat(s.total_volume_m3 || 0).toFixed(2),
      total_all: totalAll,
      same_day_pct: totalAll > 0 ? Math.round((totalSameDay / totalAll) * 100) : 0,
    },
    by_package: packageRows.map((r) => ({
      package_name: r.package_name,
      same_day_count: parseInt(r.same_day_count),
      same_day_volume_m3: parseFloat(r.same_day_volume_m3).toFixed(2),
      same_day_pct: parseInt(r.total_count) > 0
        ? Math.round((parseInt(r.same_day_count) / parseInt(r.total_count)) * 100)
        : 0,
    })),
  });
}));

// Delay analysis report — per reservation: slot, contractor, requested qty, started time, delivered qty, first/last delivery
router.get('/delay-analysis', requireRole('PMHead', 'PMManager', 'PM', 'Admin', 'ClusterHead', 'VP'), asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const packageId = await resolvePackageId(req);

  const { rows } = await query(
    `SELECT
       r.reservation_number,
       ${POUR_DATE}                                                  AS date,
       p.package_name,
       COALESCE(
         STRING_AGG(
           DISTINCT TO_CHAR(s.start_time, 'HH24:MI') || '–' || TO_CHAR(s.end_time, 'HH24:MI'),
           ', '
           ORDER BY TO_CHAR(s.start_time, 'HH24:MI') || '–' || TO_CHAR(s.end_time, 'HH24:MI')
         ),
         ''
       )                                                           AS slot,
       COALESCE(c.name, '')                                       AS contractor,
       r.quantity_m3,
       (r.started_at AT TIME ZONE 'Asia/Kolkata')                AS started_at,
       COALESCE(SUM(d.quantity_m3), 0)                           AS delivered_quantity,
       MIN(d.delivered_at AT TIME ZONE 'Asia/Kolkata')           AS first_delivery_time,
       MAX(d.delivered_at AT TIME ZONE 'Asia/Kolkata')           AS last_delivery_time
     FROM reservations r
     JOIN packages p         ON r.package_id    = p.package_id
     LEFT JOIN contractors c ON r.contractor_id = c.contractor_id
     LEFT JOIN reservation_slot_mappings rsm ON r.reservation_id = rsm.reservation_id
     LEFT JOIN slots s                       ON rsm.slot_id      = s.slot_id
     LEFT JOIN reservation_deliveries d      ON r.reservation_id = d.reservation_id
     WHERE r.status NOT IN ('Draft', 'Cancelled', 'Rejected')
       AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
       AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
       AND ($3::uuid IS NULL OR r.package_id = $3)
     GROUP BY r.reservation_id, r.reservation_number, p.package_name, c.name, r.quantity_m3, r.started_at
     ORDER BY r.requested_start`,
    [from || null, to || null, packageId]
  );
  res.json(rows);
}));

// Same-day requests detail — Admin only
router.get('/same-day-requests', requireRole('Admin'), asyncHandler(async (req, res) => {
  const { from, to, package_id } = req.query;
  const { rows } = await query(
    `SELECT
       r.reservation_number,
       ${POUR_DATE}                                      AS date,
       p.package_name,
       u.name                                            AS raised_by,
       r.structure,
       r.chainage,
       r.quantity_m3,
       r.grade,
       r.status,
       COALESCE(r.same_day_reason, '')                   AS same_day_reason,
       r.created_at
     FROM reservations r
     JOIN packages p  ON r.package_id  = p.package_id
     JOIN users u     ON r.requester_id = u.user_id
     WHERE r.priority_flag = 'SameDay'
       AND r.status NOT IN ('Draft')
       AND ($1::date IS NULL OR ${POUR_DATE} >= $1)
       AND ($2::date IS NULL OR ${POUR_DATE} <= $2)
       AND ($3::uuid IS NULL OR r.package_id = $3)
     ORDER BY r.created_at DESC`,
    [from || null, to || null, package_id || null]
  );
  res.json(rows);
}));

module.exports = router;
