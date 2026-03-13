// src/controllers/dashboard.controller.js
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

// ── PM DASHBOARD ──────────────────────────────────────────────────────────────
exports.pmDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.user_id;

  const [myReservations, pendingApprovals, recentActivity] = await Promise.all([
    // My reservations summary
    query(
      `SELECT status, COUNT(*) AS count
       FROM reservations WHERE requester_id = $1
       GROUP BY status`,
      [userId]
    ),
    // Pending approvals involving my reservations
    query(
      `SELECT aw.*, r.reservation_number, r.requested_start
       FROM approval_workflows aw
       JOIN reservations r ON aw.reservation_id = r.reservation_id
       WHERE r.requester_id = $1 AND aw.status = 'Pending'`,
      [userId]
    ),
    // Recent reservations
    query(
      `SELECT r.reservation_id, r.reservation_number, r.status, r.quantity_m3,
              r.grade, r.requested_start, pkg.package_name
       FROM reservations r
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE r.requester_id = $1
       ORDER BY r.created_at DESC LIMIT 5`,
      [userId]
    ),
  ]);

  const statusMap = {};
  myReservations.rows.forEach((r) => { statusMap[r.status] = parseInt(r.count); });

  res.json({
    summary: {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      submitted: statusMap.Submitted || 0,
      acknowledged: statusMap.Acknowledged || 0,
      pending_approval: statusMap.PendingApproval || 0,
      completed: statusMap.Completed || 0,
      cancelled: statusMap.Cancelled || 0,
    },
    pendingApprovals: pendingApprovals.rows,
    recentActivity: recentActivity.rows,
    sameDayCount: req.user.same_day_request_count || 0,
  });
});

// ── P&M HEAD DASHBOARD ────────────────────────────────────────────────────────
exports.pmHeadDashboard = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [todaySlots, pendingAck, tomorrowReservations, todayStats] = await Promise.all([
    // Today's slot utilization
    query(
      `SELECT s.slot_id, s.start_time, s.end_time, s.capacity_m3,
              COALESCE(SUM(rsm.allocated_m3), 0) AS booked_m3,
              COUNT(DISTINCT rsm.reservation_id) AS reservation_count
       FROM slots s
       LEFT JOIN reservation_slot_mappings rsm ON s.slot_id = rsm.slot_id
       LEFT JOIN reservations r ON rsm.reservation_id = r.reservation_id
         AND r.status NOT IN ('Rejected','Cancelled')
       WHERE s.slot_date = $1
       GROUP BY s.slot_id, s.start_time, s.end_time, s.capacity_m3
       ORDER BY s.start_time`,
      [today]
    ),
    // Pending acknowledgments
    query(
      `SELECT r.*, u.name AS requester_name, pkg.package_name
       FROM reservations r
       JOIN users u ON r.requester_id = u.user_id
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE r.status = 'Submitted'
       ORDER BY r.requested_start ASC`
    ),
    // Tomorrow's reservations
    query(
      `SELECT r.*, u.name AS requester_name, pkg.package_name
       FROM reservations r
       JOIN users u ON r.requester_id = u.user_id
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE DATE(r.requested_start) = $1 AND r.status IN ('Submitted','Acknowledged')
       ORDER BY r.requested_start`,
      [tomorrow]
    ),
    // Today's reservation completion split
    query(
      `SELECT
         COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
         COUNT(*) FILTER (WHERE r.status NOT IN ('Completed','Cancelled','Rejected')) AS pending
       FROM reservations r
       WHERE DATE(r.requested_start) = $1`,
      [today]
    ),
  ]);

  const stats = todayStats.rows[0] || { completed: 0, pending: 0 };
  res.json({
    todaySlots: todaySlots.rows,
    pendingAcknowledgments: pendingAck.rows,
    tomorrowReservations: tomorrowReservations.rows,
    todayCompleted: parseInt(stats.completed),
    todayPending: parseInt(stats.pending),
  });
});

// ── VP DASHBOARD ──────────────────────────────────────────────────────────────
exports.vpDashboard = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [slaStats, packageStats, pendingApprovals, capacityTrend] = await Promise.all([
    // SLA / On-time delivery
    query(
      `SELECT
         COUNT(*) AS total_completed,
         COUNT(*) FILTER (WHERE completed_at <= requested_end) AS on_time,
         AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/3600) AS avg_ack_hours,
         COALESCE(SUM(actual_quantity_m3), 0) AS total_actual_m3
       FROM reservations
       WHERE status = 'Completed'
         AND DATE(requested_start) >= $1`,
      [thirtyDaysAgo]
    ),
    // Per-package stats
    query(
      `SELECT pkg.package_name,
              COUNT(r.reservation_id) AS total,
              COUNT(*) FILTER (WHERE r.status = 'Completed') AS completed,
              COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled,
              SUM(r.quantity_m3) AS total_m3
       FROM packages pkg
       LEFT JOIN reservations r ON pkg.package_id = r.package_id
         AND r.created_at >= $1
       GROUP BY pkg.package_id, pkg.package_name
       ORDER BY total DESC`,
      [thirtyDaysAgo]
    ),
    // Pending VP approvals
    query(
      `SELECT aw.*, r.reservation_number, r.quantity_m3, r.requested_start,
              u.name AS requester_name, u.same_day_request_count, pkg.package_name
       FROM approval_workflows aw
       JOIN reservations r ON aw.reservation_id = r.reservation_id
       JOIN users u ON r.requester_id = u.user_id
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE aw.approver_id = $1 AND aw.status = 'Pending'`,
      [req.user.user_id]
    ),
    // Daily capacity utilization (last 7 days)
    query(
      `SELECT s.slot_date,
              SUM(s.capacity_m3) AS total_capacity,
              COALESCE(SUM(rsm.allocated_m3), 0) AS total_booked
       FROM slots s
       LEFT JOIN reservation_slot_mappings rsm ON s.slot_id = rsm.slot_id
       LEFT JOIN reservations r ON rsm.reservation_id = r.reservation_id
         AND r.status NOT IN ('Rejected','Cancelled')
       WHERE s.slot_date BETWEEN $1 AND CURRENT_DATE
       GROUP BY s.slot_date
       ORDER BY s.slot_date`,
      [thirtyDaysAgo]
    ),
  ]);

  const sla = slaStats.rows[0];
  res.json({
    sla: {
      totalCompleted: parseInt(sla.total_completed),
      onTime: parseInt(sla.on_time),
      onTimeRate: sla.total_completed > 0
        ? Math.round((sla.on_time / sla.total_completed) * 100)
        : 0,
      avgAckHours: parseFloat(sla.avg_ack_hours || 0).toFixed(1),
      totalActualM3: parseFloat(sla.total_actual_m3 || 0).toFixed(1),
    },
    packageStats: packageStats.rows,
    pendingApprovals: pendingApprovals.rows,
    capacityTrend: capacityTrend.rows,
  });
});

// ── CLUSTER HEAD DASHBOARD ────────────────────────────────────────────────────
exports.clusterHeadDashboard = asyncHandler(async (req, res) => {
  const { rows: pkgs } = await query(
    'SELECT package_id FROM user_packages WHERE user_id = $1',
    [req.user.user_id]
  );
  const packageIds = pkgs.map((p) => p.package_id);
  if (!packageIds.length) return res.json({ packages: [], reservations: [] });

  const [packageStats, recentReservations, pendingApprovals] = await Promise.all([
    query(
      `SELECT pkg.package_name,
              COUNT(r.reservation_id) AS total,
              COUNT(*) FILTER (WHERE r.status = 'Acknowledged') AS acknowledged,
              COUNT(*) FILTER (WHERE r.status = 'Submitted') AS pending_ack,
              SUM(r.quantity_m3) AS total_m3
       FROM packages pkg
       LEFT JOIN reservations r ON pkg.package_id = r.package_id
       WHERE pkg.package_id = ANY($1)
       GROUP BY pkg.package_id, pkg.package_name`,
      [packageIds]
    ),
    query(
      `SELECT r.*, u.name AS requester_name, pkg.package_name
       FROM reservations r
       JOIN users u ON r.requester_id = u.user_id
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE r.package_id = ANY($1)
       ORDER BY r.created_at DESC LIMIT 10`,
      [packageIds]
    ),
    query(
      `SELECT aw.*, r.reservation_number, r.quantity_m3, r.requested_start,
              u.name AS requester_name, pkg.package_name
       FROM approval_workflows aw
       JOIN reservations r ON aw.reservation_id = r.reservation_id
       JOIN users u ON r.requester_id = u.user_id
       JOIN packages pkg ON r.package_id = pkg.package_id
       WHERE aw.approver_id = $1 AND aw.status = 'Pending'`,
      [req.user.user_id]
    ),
  ]);

  res.json({
    packageStats: packageStats.rows,
    recentReservations: recentReservations.rows,
    pendingApprovals: pendingApprovals.rows,
  });
});
