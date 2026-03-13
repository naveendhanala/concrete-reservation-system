// src/routes/notification.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.user_id]
  );
  res.json(rows);
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  await query(
    'UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2',
    [req.params.id, req.user.user_id]
  );
  res.json({ ok: true });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.user_id]);
  res.json({ ok: true });
}));

module.exports = router;
