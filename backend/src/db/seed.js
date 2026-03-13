// src/db/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding database...');

    // ── Config ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO config (key, value, description) VALUES
        ('cutoff_hours', '4', 'Hours before slot start after which modification needs P&M approval')
      ON CONFLICT (key) DO NOTHING
    `);

    // ── Packages ──────────────────────────────────────────────
    const packages = [
      'Package 1 - E6', 'Package 2 - E8', 'Package 3 - E9', 'Package 4 - E13',
      'Package 5 - N7', 'Package 6 - N10', 'Package 7 - N11', 'Package 8 - N13',
      'Package 9 - N14', 'Package 10 - Zone 3A', 'Package 11 - Zone 4',
      'Package 12 - Zone 5B', 'Package 13 - Zone 10',
    ];
    const pkgIds = {};
    for (const name of packages) {
      const { rows } = await client.query(
        `INSERT INTO packages (package_name) VALUES ($1)
         ON CONFLICT (package_name) DO UPDATE SET package_name = EXCLUDED.package_name
         RETURNING package_id`,
        [name]
      );
      pkgIds[name] = rows[0].package_id;
    }
    console.log('  ✓ Packages seeded');

    // ── Users ─────────────────────────────────────────────────
    const hash = (pw) => bcrypt.hashSync(pw, 10);

    const adminId = await insertUser(client, { name: 'System Admin', role: 'Admin', email: 'admin@concrete.com', hash: hash('Admin@123') });
    const vpId = await insertUser(client, { name: 'Vice President', role: 'VP', email: 'vp@concrete.com', hash: hash('VP@123') });
    const pmHeadId = await insertUser(client, { name: 'P&M Head', role: 'PMHead', email: 'pm_head@concrete.com', hash: hash('PMHead@123') });

    const ch1Id = await insertUser(client, { name: 'Cluster Head 1', role: 'ClusterHead', email: 'ch1@concrete.com', hash: hash('CH@123') });
    const ch2Id = await insertUser(client, { name: 'Cluster Head 2', role: 'ClusterHead', email: 'ch2@concrete.com', hash: hash('CH@123') });

    // Assign packages to cluster heads
    const ch1Packages = packages.slice(0, 7).map((n) => pkgIds[n]);
    const ch2Packages = packages.slice(7).map((n) => pkgIds[n]);
    for (const pkgId of ch1Packages) {
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch1Id, pkgId]);
    }
    for (const pkgId of ch2Packages) {
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch2Id, pkgId]);
    }

    // Project Managers (one per package)
    for (let i = 0; i < packages.length; i++) {
      const pmId = await insertUser(client, {
        name: `Project Manager ${i + 1}`,
        role: 'PM',
        email: `pm${i + 1}@concrete.com`,
        hash: hash('PM@123'),
      });
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmId, pkgIds[packages[i]]]);
    }
    console.log('  ✓ Users seeded');

    // ── Site Engineers ────────────────────────────────────────
    await client.query(`DELETE FROM site_engineers WHERE package_id = ANY($1)`, [Object.values(pkgIds)]);
    for (let i = 0; i < packages.length; i++) {
      for (let j = 1; j <= 3; j++) {
        await client.query(
          `INSERT INTO site_engineers (name, contact, package_id) VALUES ($1, $2, $3)`,
          [`Engineer ${i + 1}-${j}`, `+91-98765-${String(i * 3 + j).padStart(5, '0')}`, pkgIds[packages[i]]]
        );
      }
    }
    console.log('  ✓ Site engineers seeded');

    // ── Contractors ───────────────────────────────────────────
    const contractors = ['Larsen & Toubro', 'Afcons Infrastructure', 'NCC Limited', 'Simplex Infrastructure', 'Patel Engineering'];
    for (const name of contractors) {
      await client.query(
        `INSERT INTO contractors (name) VALUES ($1) ON CONFLICT DO NOTHING`,
        [name]
      );
    }
    console.log('  ✓ Contractors seeded');

    // ── Slots: generate for next 14 days using fixed shifts ─────
    const { generateSlotsForDate } = require('../config/shifts');

    for (let day = 0; day < 14; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      // Use local date to avoid UTC timezone mismatch
      const yyyy = date.getFullYear();
      const mm   = String(date.getMonth() + 1).padStart(2, '0');
      const dd   = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      for (const slot of generateSlotsForDate(dateStr)) {
        await client.query(
          `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3)
           VALUES ($1, $2, $3, $4) ON CONFLICT (slot_date, start_time) DO NOTHING`,
          [slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3]
        );
      }
    }
    console.log('  ✓ Slots seeded (next 14 days, 5 shifts/day)');

    await client.query('COMMIT');
    console.log('\n✅ Database seeded successfully!');
    console.log('\nDefault credentials:');
    console.log('  Admin:       admin@concrete.com  / Admin@123');
    console.log('  VP:          vp@concrete.com     / VP@123');
    console.log('  P&M Head:    pm_head@concrete.com / PMHead@123');
    console.log('  Cluster Head: ch1@concrete.com   / CH@123');
    console.log('  PM 1-13:     pm1@concrete.com    / PM@123');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertUser(client, { name, role, email, hash }) {
  const { rows } = await client.query(
    `INSERT INTO users (name, role, email, password_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING user_id`,
    [name, role, email, hash]
  );
  return rows[0].user_id;
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});