// src/db/clear-reservations.js
// Deletes all reservations and their dependent data (approvals, audit logs, deliveries).
// Safe to run repeatedly — does not touch users, packages, slots, contractors, or engineers.
require('dotenv').config();
const { pool } = require('../config/db');

async function clearReservations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete in dependency order (children before parent reservations)
    const { rowCount: deliveries }   = await client.query('DELETE FROM reservation_deliveries');
    const { rowCount: history }      = await client.query('DELETE FROM reservation_history');
    const { rowCount: notifications} = await client.query('DELETE FROM notifications');
    const { rowCount: batches }      = await client.query('DELETE FROM batch_assignments');
    const { rowCount: approvals }    = await client.query('DELETE FROM approval_workflows');
    const { rowCount: slotMappings } = await client.query('DELETE FROM reservation_slot_mappings');
    const { rowCount: audits }       = await client.query('DELETE FROM audit_logs');
    const { rowCount: reservations } = await client.query('DELETE FROM reservations');

    await client.query('COMMIT');

    console.log('✅ Reservations cleared:');
    console.log(`   Deliveries removed       : ${deliveries}`);
    console.log(`   History removed          : ${history}`);
    console.log(`   Notifications removed    : ${notifications}`);
    console.log(`   Batch assignments removed: ${batches}`);
    console.log(`   Approvals removed        : ${approvals}`);
    console.log(`   Slot mappings removed    : ${slotMappings}`);
    console.log(`   Audit logs removed       : ${audits}`);
    console.log(`   Reservations removed     : ${reservations}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to clear reservations:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearReservations();
