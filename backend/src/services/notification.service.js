// src/services/notification.service.js
const nodemailer = require('nodemailer');
const { query } = require('../config/db');
const logger = require('../config/logger');

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

async function notifyReservationCreated(reservation, requester) {
  // Notify P&M Head
  const { rows: pmHeads } = await query(`SELECT user_id, email FROM users WHERE role = 'PMHead'`);
  for (const pmh of pmHeads) {
    await createInAppNotification(
      pmh.user_id,
      'New Concrete Reservation',
      `${requester.name} submitted reservation ${reservation.reservation_number} for ${reservation.quantity_m3} m³`,
      reservation.reservation_id
    );
    await sendEmail(
      pmh.email,
      `New Reservation: ${reservation.reservation_number}`,
      `<p>A new concrete reservation has been submitted.</p>
       <p><b>Reservation:</b> ${reservation.reservation_number}</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>`
    );
  }
}

async function notifyReservationAcknowledged(reservation) {
  const { rows: user } = await query(
    'SELECT user_id, email FROM users WHERE user_id = $1',
    [reservation.requester_id]
  );
  if (!user[0]) return;
  await createInAppNotification(
    user[0].user_id,
    'Reservation Acknowledged',
    `Your reservation ${reservation.reservation_number} has been acknowledged by P&M.`,
    reservation.reservation_id
  );
  await sendEmail(
    user[0].email,
    `Reservation Acknowledged: ${reservation.reservation_number}`,
    `<p>Your reservation <b>${reservation.reservation_number}</b> has been acknowledged.</p>`
  );
}

async function notifySlotProposed(reservation) {
  const { rows: user } = await query(
    'SELECT user_id, email FROM users WHERE user_id = $1',
    [reservation.requester_id]
  );
  if (!user[0]) return;
  await createInAppNotification(
    user[0].user_id,
    'Alternative Slot Proposed',
    `P&M has proposed an alternative slot for reservation ${reservation.reservation_number}.`,
    reservation.reservation_id
  );
}

async function notifyApprovalActioned(approval, action) {
  const { rows: res } = await query(
    `SELECT r.requester_id, r.reservation_number, u.email
     FROM reservations r JOIN users u ON r.requester_id = u.user_id
     WHERE r.reservation_id = $1`,
    [approval.reservation_id]
  );
  if (!res[0]) return;
  const status = action === 'Approved' ? 'approved' : 'rejected';
  await createInAppNotification(
    res[0].requester_id,
    `Reservation ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    `Your same-day reservation ${res[0].reservation_number} has been ${status}.`,
    approval.reservation_id
  );
}

module.exports = {
  notifyReservationCreated,
  notifyReservationAcknowledged,
  notifySlotProposed,
  notifyApprovalActioned,
  createInAppNotification,
};
