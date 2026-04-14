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
  try {
    const notifTitle = 'New Concrete Reservation';
    const notifMessage = `${requester.name} submitted reservation ${reservation.reservation_number} for ${reservation.quantity_m3} m³`;
    const emailSubject = `New Reservation: ${reservation.reservation_number}`;
    const emailBody = `<p>A new concrete reservation has been submitted.</p>
       <p><b>Reservation:</b> ${reservation.reservation_number}</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Batching Plant:</b> ${reservation.batching_plant || 'N/A'}</p>`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;

    const { rows: pmHeads } = await query(`SELECT user_id, email FROM users WHERE role = 'PMHead'`);
    for (const pmh of pmHeads) {
      await createInAppNotification(pmh.user_id, notifTitle, notifMessage, reservation.reservation_id);
      await sendEmail(pmh.email, emailSubject, emailBody);
      await sendPushToUser(pmh.user_id, notifTitle, notifMessage, reservationUrl);
    }

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
  } catch (err) {
    logger.error('notifyReservationCreated failed:', err.message);
  }
}

async function notifyReservationAcknowledged(reservation) {
  try {
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
  } catch (err) {
    logger.error('notifyReservationAcknowledged failed:', err.message);
  }
}

async function notifySlotProposed(reservation) {
  try {
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
  } catch (err) {
    logger.error('notifySlotProposed failed:', err.message);
  }
}

async function notifyReservationStarted(reservation) {
  try {
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
  } catch (err) {
    logger.error('notifyReservationStarted failed:', err.message);
  }
}

async function notifyApprovalActioned(approval, action) {
  try {
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
  } catch (err) {
    logger.error('notifyApprovalActioned failed:', err.message);
  }
}

async function notifyApprovalRequested(reservation, vpUserId) {
  try {
    const title = 'Same-Day Approval Required';
    const message = `Reservation ${reservation.reservation_number} requires your approval (${reservation.quantity_m3} m³, ${reservation.grade}).`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;
    const { rows: vp } = await query('SELECT email FROM users WHERE user_id = $1', [vpUserId]);
    if (!vp[0]) return;
    await createInAppNotification(vpUserId, title, message, reservation.reservation_id);
    await sendEmail(
      vp[0].email,
      `Approval Required: ${reservation.reservation_number}`,
      `<p>A same-day reservation requires your approval.</p>
       <p><b>Reservation:</b> ${reservation.reservation_number}</p>
       <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
       <p><b>Structure:</b> ${reservation.structure || 'N/A'}</p>`
    );
    await sendPushToUser(vpUserId, title, message, reservationUrl);
  } catch (err) {
    logger.error('notifyApprovalRequested failed:', err.message);
  }
}

async function notifyClusterHeadReservationCreated(reservation, requesterName) {
  try {
    const { rows: clusterHeads } = await query(
      `SELECT DISTINCT u.user_id, u.email
       FROM users u
       JOIN user_packages up ON u.user_id = up.user_id
       WHERE u.role = 'ClusterHead' AND up.package_id = $1`,
      [reservation.package_id]
    );
    const title = 'New Reservation in Your Package';
    const message = `${requesterName} submitted reservation ${reservation.reservation_number} for ${reservation.quantity_m3} m³ (${reservation.grade}).`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;
    for (const ch of clusterHeads) {
      await createInAppNotification(ch.user_id, title, message, reservation.reservation_id);
      await sendEmail(
        ch.email,
        `New Reservation: ${reservation.reservation_number}`,
        `<p>A new reservation has been submitted in your package.</p>
         <p><b>Reservation:</b> ${reservation.reservation_number}</p>
         <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
         <p><b>Batching Plant:</b> ${reservation.batching_plant || 'N/A'}</p>`
      );
      await sendPushToUser(ch.user_id, title, message, reservationUrl);
    }
  } catch (err) {
    logger.error('notifyClusterHeadReservationCreated failed:', err.message);
  }
}

async function notifyClusterHeadReservationCancelled(reservation) {
  try {
    const { rows: clusterHeads } = await query(
      `SELECT DISTINCT u.user_id, u.email
       FROM users u
       JOIN user_packages up ON u.user_id = up.user_id
       WHERE u.role = 'ClusterHead' AND up.package_id = $1`,
      [reservation.package_id]
    );
    const title = 'Reservation Cancelled';
    const message = `Reservation ${reservation.reservation_number} (${reservation.quantity_m3} m³) has been cancelled.`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;
    for (const ch of clusterHeads) {
      await createInAppNotification(ch.user_id, title, message, reservation.reservation_id);
      await sendEmail(
        ch.email,
        `Reservation Cancelled: ${reservation.reservation_number}`,
        `<p>A reservation in your package has been cancelled.</p>
         <p><b>Reservation:</b> ${reservation.reservation_number}</p>
         <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
         <p><b>Reason:</b> ${reservation.cancellation_reason || 'N/A'}</p>`
      );
      await sendPushToUser(ch.user_id, title, message, reservationUrl);
    }
  } catch (err) {
    logger.error('notifyClusterHeadReservationCancelled failed:', err.message);
  }
}

async function notifyPMManagerReservationCompleted(reservation) {
  try {
    if (!reservation.batching_plant) return;
    const { rows: managers } = await query(
      `SELECT u.user_id, u.email
       FROM users u
       JOIN user_batching_plants ubp ON u.user_id = ubp.user_id
       JOIN batching_plants bp ON ubp.plant_id = bp.plant_id
       WHERE u.role = 'PMManager' AND bp.plant_name = $1`,
      [reservation.batching_plant]
    );
    const title = 'Reservation Completed';
    const message = `Reservation ${reservation.reservation_number} has been marked as completed (${reservation.actual_quantity_m3 ?? reservation.quantity_m3} m³ delivered).`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;
    for (const mgr of managers) {
      await createInAppNotification(mgr.user_id, title, message, reservation.reservation_id);
      await sendEmail(
        mgr.email,
        `Reservation Completed: ${reservation.reservation_number}`,
        `<p>Reservation <b>${reservation.reservation_number}</b> has been completed.</p>
         <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
         <p><b>Batching Plant:</b> ${reservation.batching_plant}</p>`
      );
      await sendPushToUser(mgr.user_id, title, message, reservationUrl);
    }
  } catch (err) {
    logger.error('notifyPMManagerReservationCompleted failed:', err.message);
  }
}

async function notifyPMManagerReservationCancelled(reservation) {
  try {
    if (!reservation.batching_plant) return;
    const { rows: managers } = await query(
      `SELECT u.user_id, u.email
       FROM users u
       JOIN user_batching_plants ubp ON u.user_id = ubp.user_id
       JOIN batching_plants bp ON ubp.plant_id = bp.plant_id
       WHERE u.role = 'PMManager' AND bp.plant_name = $1`,
      [reservation.batching_plant]
    );
    const title = 'Reservation Cancelled';
    const message = `Reservation ${reservation.reservation_number} (${reservation.quantity_m3} m³, ${reservation.grade}) has been cancelled.`;
    const reservationUrl = `/reservations/${reservation.reservation_id}`;
    for (const mgr of managers) {
      await createInAppNotification(mgr.user_id, title, message, reservation.reservation_id);
      await sendEmail(
        mgr.email,
        `Reservation Cancelled: ${reservation.reservation_number}`,
        `<p>Reservation <b>${reservation.reservation_number}</b> has been cancelled.</p>
         <p><b>Quantity:</b> ${reservation.quantity_m3} m³ | <b>Grade:</b> ${reservation.grade}</p>
         <p><b>Batching Plant:</b> ${reservation.batching_plant}</p>
         <p><b>Reason:</b> ${reservation.cancellation_reason || 'N/A'}</p>`
      );
      await sendPushToUser(mgr.user_id, title, message, reservationUrl);
    }
  } catch (err) {
    logger.error('notifyPMManagerReservationCancelled failed:', err.message);
  }
}

module.exports = {
  notifyReservationCreated,
  notifyReservationAcknowledged,
  notifyReservationStarted,
  notifySlotProposed,
  notifyApprovalActioned,
  notifyApprovalRequested,
  notifyClusterHeadReservationCreated,
  notifyClusterHeadReservationCancelled,
  notifyPMManagerReservationCompleted,
  notifyPMManagerReservationCancelled,
  createInAppNotification,
  sendPushToUser,
};
