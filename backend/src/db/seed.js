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

    // ── Batching Plants ───────────────────────────────────────
    const plants = ['Batching Plant 1', 'Batching Plant 2', 'Batching Plant 3'];
    const plantIds = {};
    for (const name of plants) {
      const { rows } = await client.query(
        `INSERT INTO batching_plants (plant_name) VALUES ($1)
         ON CONFLICT (plant_name) DO UPDATE SET plant_name = EXCLUDED.plant_name
         RETURNING plant_id`,
        [name]
      );
      plantIds[name] = rows[0].plant_id;
    }
    console.log('  ✓ Batching plants seeded');

    // ── Packages ──────────────────────────────────────────────
    // Plant 1: Packages 1-5, Plant 2: Packages 6-9, Plant 3: Packages 10-13
    const packagePlantMap = [
      { name: 'Package 1 - E6',       plant: 'Batching Plant 1' },
      { name: 'Package 2 - E8',       plant: 'Batching Plant 1' },
      { name: 'Package 3 - E9',       plant: 'Batching Plant 1' },
      { name: 'Package 4 - E13',      plant: 'Batching Plant 1' },
      { name: 'Package 5 - N7',       plant: 'Batching Plant 1' },
      { name: 'Package 6 - N10',      plant: 'Batching Plant 2' },
      { name: 'Package 7 - N11',      plant: 'Batching Plant 2' },
      { name: 'Package 8 - N13',      plant: 'Batching Plant 2' },
      { name: 'Package 9 - N14',      plant: 'Batching Plant 2' },
      { name: 'Package 10 - Zone 3A', plant: 'Batching Plant 3' },
      { name: 'Package 11 - Zone 4',  plant: 'Batching Plant 3' },
      { name: 'Package 12 - Zone 5B', plant: 'Batching Plant 3' },
      { name: 'Package 13 - Zone 10', plant: 'Batching Plant 3' },
    ];
    const packages = packagePlantMap.map((p) => p.name);
    const pkgIds = {};
    for (const { name, plant } of packagePlantMap) {
      const { rows } = await client.query(
        `INSERT INTO packages (package_name, batching_plant_id) VALUES ($1, $2)
         ON CONFLICT (package_name) DO UPDATE SET batching_plant_id = EXCLUDED.batching_plant_id
         RETURNING package_id`,
        [name, plantIds[plant]]
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

    // P&M Managers (one per batching plant)
    const pmm1Id = await insertUser(client, { name: 'P&M Manager - Plant 1', role: 'PMManager', email: 'pmm1@concrete.com', hash: hash('PMM@123') });
    const pmm2Id = await insertUser(client, { name: 'P&M Manager - Plant 2', role: 'PMManager', email: 'pmm2@concrete.com', hash: hash('PMM@123') });
    const pmm3Id = await insertUser(client, { name: 'P&M Manager - Plant 3', role: 'PMManager', email: 'pmm3@concrete.com', hash: hash('PMM@123') });
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm1Id, plantIds['Batching Plant 1']]);
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm2Id, plantIds['Batching Plant 2']]);
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm3Id, plantIds['Batching Plant 3']]);

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
    // Only delete engineers not referenced by any existing reservation
    await client.query(
      `DELETE FROM site_engineers
       WHERE package_id = ANY($1)
         AND engineer_id NOT IN (
           SELECT site_engineer_id FROM reservations WHERE site_engineer_id IS NOT NULL
         )`,
      [Object.values(pkgIds)]
    );
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
    console.log('  Admin:         admin@concrete.com   / Admin@123');
    console.log('  VP:            vp@concrete.com      / VP@123');
    console.log('  P&M Head:      pm_head@concrete.com / PMHead@123');
    console.log('  P&M Manager 1: pmm1@concrete.com    / PMM@123  (Plant 1 - Pkgs 1-5)');
    console.log('  P&M Manager 2: pmm2@concrete.com    / PMM@123  (Plant 2 - Pkgs 6-9)');
    console.log('  P&M Manager 3: pmm3@concrete.com    / PMM@123  (Plant 3 - Pkgs 10-13)');
    console.log('  Cluster Head:  ch1@concrete.com     / CH@123');
    console.log('  PM 1-13:       pm1@concrete.com     / PM@123');
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
