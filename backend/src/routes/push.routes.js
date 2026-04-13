// src/routes/push.routes.js
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendPushToUser } = require('../services/notification.service');
const router = express.Router();

// Save push subscription for current user
router.post('/subscribe', asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4`,
    [req.user.user_id, endpoint, keys.p256dh, keys.auth]
  );

  res.json({ ok: true });
}));

// Remove push subscription (on logout / permission revoked)
router.delete('/subscribe', asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });

  await query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [req.user.user_id, endpoint]
  );

  res.json({ ok: true });
}));

// Send a test push notification to the current user
router.post('/test', asyncHandler(async (req, res) => {
  const webpush = require('web-push');

  // Check VAPID config
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not configured on server' });
  }

  // Check subscription exists
  const { rows: subs } = await query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [req.user.user_id]
  );

  if (subs.length === 0) {
    return res.status(404).json({ error: 'No push subscription found for your account. Try enabling notifications again.' });
  }

  const payload = JSON.stringify({ title: 'Test Notification', body: 'Push notifications are working correctly.', url: '/' });
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  const failures = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? 'unknown error');

  if (failures.length === subs.length) {
    return res.status(500).json({ error: 'Push send failed: ' + failures[0] });
  }

  res.json({ ok: true, sent: subs.length - failures.length, failed: failures.length });
}));

module.exports = router;
