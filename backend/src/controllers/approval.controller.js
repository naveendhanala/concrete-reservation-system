// src/controllers/approval.controller.js
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const notificationService = require('../services/notification.service');

exports.list = asyncHandler(async (req, res) => {
  const user = req.user;
  const { status } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (user.role === 'VP' || user.role === 'ClusterHead' || user.role === 'PMHead') {
    params.push(user.user_id);
    whereClause += ` AND aw.approver_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    whereClause += ` AND aw.status = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT aw.*,
       r.reservation_number, r.quantity_m3, r.grade, r.structure,
       r.requested_start, r.priority_flag, r.status AS reservation_status,
       u.name AS requester_name, u.same_day_request_count,
       pkg.package_name
     FROM approval_workflows aw
     JOIN reservations r ON aw.reservation_id = r.reservation_id
     JOIN users u ON r.requester_id = u.user_id
     JOIN packages pkg ON r.package_id = pkg.package_id
     ${whereClause}
     ORDER BY aw.created_at DESC`,
    params
  );

  res.json(rows);
});

exports.action = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, remarks } = req.body;
  const user = req.user;

  const { rows: approval } = await query(
    'SELECT * FROM approval_workflows WHERE approval_id = $1',
    [id]
  );
  if (!approval[0]) throw new AppError('Approval not found', 404);
  if (approval[0].status !== 'Pending') throw new AppError('Already acted upon', 400);
  if (approval[0].approver_id !== user.user_id) throw new AppError('Not your approval', 403);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE approval_workflows SET status = $1, remarks = $2, acted_at = NOW() WHERE approval_id = $3`,
      [action, remarks, id]
    );

    if (action === 'Approved') {
      await client.query(
        `UPDATE reservations SET status = 'Submitted' WHERE reservation_id = $1`,
        [approval[0].reservation_id]
      );
    } else {
      await client.query(
        `UPDATE reservations SET status = 'Rejected', rejection_reason = $1 WHERE reservation_id = $2`,
        [remarks, approval[0].reservation_id]
      );
    }
  });

  const { rows: updated } = await query(
    'SELECT * FROM approval_workflows WHERE approval_id = $1',
    [id]
  );
  await notificationService.notifyApprovalActioned(updated[0], action);
  res.json(updated[0]);
});
