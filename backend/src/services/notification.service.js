// src/services/notification.service.js
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { query } = require('../config/db');
const logger = require('../config/logger');

// Configure VAPID (only when keys are present)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@concrete-system.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@concrete.com',
      to, subject, html,
    });
  } catch (err) {
    logger.error('Email send failed:', { to, subject, error: err.message });
  }
}

async function createInAppNotification(userId, title, message, reservationId = null) {
  try {
    await query(
      `INSERT INTO notifications (user_id, title, message, channel, reservation_id)
       VALUES ($1, $2, $3, 'InApp', $4)`,
      [userId, title, message, reservationId]
    );
  } catch (err) {
    logger.error('In-app notification failed:', err.message);
  }
}

async function sendPushToUser(userId, title, body, url = '/') {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const { rows: subs } = await query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    const payload = JSON.stringify({ title, body, url });
    await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          .catch(async (err) => {
            // 410 Gone = subscription expired, clean it up
            if (err.statusCode === 410) {
              await query(
                'DELETE FROM push_subscriptions WHERE endpoint = $1',
                [sub.endpoint]
              );
            }
          })
      )
    );
  } catch (err) {
    logger.error('Push notification failed:', { userId, error: err.message });
  }
}

async function notifyReservationCreated(reservation, requester) {
  const notifTitle = 'New Concrete Reservation';
  const notifMessage = `${requester.name} submitted reservation ${reservation.reservation_number} for ${reservation.quantity_m3} m³`;
  const emailSubject = `New Reservation: ${reservation.reservation_number}`;
  const emailBody = `<p>A new concrete reservation has been submitted.</p>
       <p><b>Reservation:</b> ${reservation.reservation_number}</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Batching Plant:</b> ${reservation.batching_plant || 'N/A'}</p>`;
  const reservationUrl = `/reservations/${reservation.reservation_id}`;

  // Notify P&M Head
  const { rows: pmHeads } = await query(`SELECT user_id, email FROM users WHERE role = 'PMHead'`);
  for (const pmh of pmHeads) {
    await createInAppNotification(pmh.user_id, notifTitle, notifMessage, reservation.reservation_id);
    await sendEmail(pmh.email, emailSubject, emailBody);
    await sendPushToUser(pmh.user_id, notifTitle, notifMessage, reservationUrl);
  }

  // Notify P&M Managers assigned to this batching plant
  if (reservation.batching_plant) {
    const { rows: managers } = await query(
      `SELECT u.user_id, u.email
       FROM users u
       JOIN user_batching_plants ubp ON u.user_id = ubp.user_id
       JOIN batching_plants bp ON ubp.plant_id = bp.plant_id
       WHERE u.role = 'PMManager' AND bp.plant_name = $1`,
      [reservation.batching_plant]
    );
    for (const mgr of managers) {
      await createInAppNotification(mgr.user_id, notifTitle, notifMessage, reservation.reservation_id);
      await sendEmail(mgr.email, emailSubject, emailBody);
      await sendPushToUser(mgr.user_id, notifTitle, notifMessage, reservationUrl);
    }
  }
}

async function notifyReservationAcknowledged(reservation) {
  const { rows: user } = await query(
    'SELECT user_id, email FROM users WHERE user_id = $1',
    [reservation.requester_id]
  );
  if (!user[0]) return;
  const title = 'Reservation Acknowledged';
  const message = `Your reservation ${reservation.reservation_number} has been acknowledged by P&M.`;
  const reservationUrl = `/reservations/${reservation.reservation_id}`;
  await createInAppNotification(user[0].user_id, title, message, reservation.reservation_id);
  await sendEmail(
    user[0].email,
    `Reservation Acknowledged: ${reservation.reservation_number}`,
    `<p>Your reservation <b>${reservation.reservation_number}</b> has been acknowledged.</p>`
  );
  await sendPushToUser(user[0].user_id, title, message, reservationUrl);
}

async function notifySlotProposed(reservation) {
  const { rows: user } = await query(
    'SELECT user_id, email FROM users WHERE user_id = $1',
    [reservation.requester_id]
  );
  if (!user[0]) return;
  const title = 'Alternative Slot Proposed';
  const message = `P&M has proposed an alternative slot for reservation ${reservation.reservation_number}.`;
  const reservationUrl = `/reservations/${reservation.reservation_id}`;
  await createInAppNotification(user[0].user_id, title, message, reservation.reservation_id);
  await sendPushToUser(user[0].user_id, title, message, reservationUrl);
}

async function notifyReservationStarted(reservation) {
  if (!reservation.batching_plant) return;
  const { rows: managers } = await query(
    `SELECT u.user_id, u.email
     FROM users u
     JOIN user_batching_plants ubp ON u.user_id = ubp.user_id
     JOIN batching_plants bp ON ubp.plant_id = bp.plant_id
     WHERE u.role = 'PMManager' AND bp.plant_name = $1`,
    [reservation.batching_plant]
  );
  const title = 'Reservation Started';
  const message = `Reservation ${reservation.reservation_number} has been started and is ready for concrete delivery.`;
  const reservationUrl = `/reservations/${reservation.reservation_id}`;
  for (const mgr of managers) {
    await createInAppNotification(mgr.user_id, title, message, reservation.reservation_id);
    await sendEmail(
      mgr.email,
      `Reservation Started: ${reservation.reservation_number}`,
      `<p>Reservation <b>${reservation.reservation_number}</b> has been started.</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Batching Plant:</b> ${reservation.batching_plant}</p>`
    );
    await sendPushToUser(mgr.user_id, title, message, reservationUrl);
  }
}

async function notifyApprovalActioned(approval, action) {
  const { rows: res } = await query(
    `SELECT r.requester_id, r.reservation_id, r.reservation_number, u.email
     FROM reservations r JOIN users u ON r.requester_id = u.user_id
     WHERE r.reservation_id = $1`,
    [approval.reservation_id]
  );
  if (!res[0]) return;
  const status = action === 'Approved' ? 'approved' : 'rejected';
  const title = `Reservation ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  const message = `Your same-day reservation ${res[0].reservation_number} has been ${status}.`;
  const reservationUrl = `/reservations/${res[0].reservation_id}`;
  await createInAppNotification(res[0].requester_id, title, message, approval.reservation_id);
  await sendPushToUser(res[0].requester_id, title, message, reservationUrl);
}

module.exports = {
  notifyReservationCreated,
  notifyReservationAcknowledged,
  notifyReservationStarted,
  notifySlotProposed,
  notifyApprovalActioned,
  createInAppNotification,
  sendPushToUser,
};
