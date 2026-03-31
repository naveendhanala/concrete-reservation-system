// src/db/generate-slots.js
// Generates slots for the next 30 days on any database.
// Usage:
//   node src/db/generate-slots.js                        (uses .env DB_HOST/etc.)
//   DATABASE_URL=postgres://... node src/db/generate-slots.js

require('dotenv').config();
const { Pool } = require('pg');
const { generateSlotsForDate } = require('../config/shifts');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

const DAYS = parseInt(process.env.SLOT_DAYS || '30', 10);

async function run() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  console.log('Connected. Generating slots...');
  try {
    const test = await client.query('SELECT NOW()');
    console.log('DB time:', test.rows[0].now);
    await client.query('BEGIN');
    console.log('Transaction started');
    let total = 0;

    for (let day = 0; day < DAYS; day++) {
      console.log(`Day ${day + 1}/${DAYS}...`);
      const date = new Date();
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().slice(0, 10);

      for (const slot of generateSlotsForDate(dateStr)) {
        await client.query(
          `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3, batching_plant)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slot_date, start_time, batching_plant) DO NOTHING`,
          [slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3, slot.batching_plant]
        );
        total++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Generated slots for ${DAYS} days (up to ${total} slot rows inserted, skipped existing)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
