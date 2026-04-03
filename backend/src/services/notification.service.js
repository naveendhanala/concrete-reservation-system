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
  const notifTitle = 'New Concrete Reservation';
  const notifMessage = `${requester.name} submitted reservation ${reservation.reservation_number} for ${reservation.quantity_m3} m³`;
  const emailSubject = `New Reservation: ${reservation.reservation_number}`;
  const emailBody = `<p>A new concrete reservation has been submitted.</p>
       <p><b>Reservation:</b> ${reservation.reservation_number}</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Batching Plant:</b> ${reservation.batching_plant || 'N/A'}</p>`;

  // Notify P&M Head
  const { rows: pmHeads } = await query(`SELECT user_id, email FROM users WHERE role = 'PMHead'`);
  for (const pmh of pmHeads) {
    await createInAppNotification(pmh.user_id, notifTitle, notifMessage, reservation.reservation_id);
    await sendEmail(pmh.email, emailSubject, emailBody);
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
    }
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
  for (const mgr of managers) {
    await createInAppNotification(
      mgr.user_id,
      'Reservation Started',
      `Reservation ${reservation.reservation_number} has been started and is ready for concrete delivery.`,
      reservation.reservation_id
    );
    await sendEmail(
      mgr.email,
      `Reservation Started: ${reservation.reservation_number}`,
      `<p>Reservation <b>${reservation.reservation_number}</b> has been started.</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Batching Plant:</b> ${reservation.batching_plant}</p>`
    );
  }
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
  notifyReservationStarted,
  notifySlotProposed,
  notifyApprovalActioned,
  createInAppNotification,
};
