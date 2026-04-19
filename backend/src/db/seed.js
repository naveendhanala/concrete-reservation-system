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
    // Names match the physical plant names used in shifts.js
    const plants = ['Camp-1 M3', 'Camp-2 M3', 'Camp-3 M1', 'Camp-1 CP-30'];
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
    const packages = ['E6', 'E8', 'E9', 'E13', 'N7', 'N10', 'N11', 'N13', 'N14', 'Zone 3A', 'Zone 4', 'Zone 5B', 'Zone 10'];
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

    const adminId = await insertUser(client, { name: 'System Admin', role: 'Admin', loginId: 'admin', email: 'admin@concrete.com', hash: hash('Admin@123'), plainPw: 'Admin@123' });
    const vpId = await insertUser(client, { name: 'Vice President', role: 'VP', loginId: 'vp', email: 'vp@concrete.com', hash: hash('VP@123'), plainPw: 'VP@123' });
    const pmHeadId = await insertUser(client, { name: 'P&M Head', role: 'PMHead', loginId: 'pmhead', email: 'pm_head@concrete.com', hash: hash('PMHead@123'), plainPw: 'PMHead@123' });

    const ch1Id = await insertUser(client, { name: 'Cluster Head 1', role: 'ClusterHead', loginId: 'ch1', email: 'ch1@concrete.com', hash: hash('CH@123'), plainPw: 'CH@123' });
    const ch2Id = await insertUser(client, { name: 'Cluster Head 2', role: 'ClusterHead', loginId: 'ch2', email: 'ch2@concrete.com', hash: hash('CH@123'), plainPw: 'CH@123' });

    // Assign packages to cluster heads (CH1: pkgs 1-8, CH2: pkgs 9-13)
    const ch1Packages = packages.slice(0, 8).map((n) => pkgIds[n]);
    const ch2Packages = packages.slice(8).map((n) => pkgIds[n]);
    for (const pkgId of ch1Packages) {
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch1Id, pkgId]);
    }
    for (const pkgId of ch2Packages) {
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch2Id, pkgId]);
    }

    // P&M Managers (one per batching plant — matches shifts.js plant names)
    const pmm1Id = await insertUser(client, { name: 'P&M Manager - Camp-1 M3',    role: 'PMManager', loginId: 'pmm1', email: 'pmm1@concrete.com', hash: hash('PMM@123'), plainPw: 'PMM@123' });
    const pmm2Id = await insertUser(client, { name: 'P&M Manager - Camp-2 M3',    role: 'PMManager', loginId: 'pmm2', email: 'pmm2@concrete.com', hash: hash('PMM@123'), plainPw: 'PMM@123' });
    const pmm3Id = await insertUser(client, { name: 'P&M Manager - Camp-3 M1',    role: 'PMManager', loginId: 'pmm3', email: 'pmm3@concrete.com', hash: hash('PMM@123'), plainPw: 'PMM@123' });
    const pmm4Id = await insertUser(client, { name: 'P&M Manager - Camp-1 CP-30', role: 'PMManager', loginId: 'pmm4', email: 'pmm4@concrete.com', hash: hash('PMM@123'), plainPw: 'PMM@123' });
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm1Id, plantIds['Camp-1 M3']]);
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm2Id, plantIds['Camp-2 M3']]);
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm3Id, plantIds['Camp-3 M1']]);
    await client.query('INSERT INTO user_batching_plants (user_id, plant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmm4Id, plantIds['Camp-1 CP-30']]);

    // Project Managers (one per package)
    for (let i = 0; i < packages.length; i++) {
      const pmId = await insertUser(client, {
        name: `Project Manager ${i + 1}`,
        role: 'PM',
        loginId: `pm${i + 1}`,
        email: `pm${i + 1}@concrete.com`,
        hash: hash('PM@123'),
        plainPw: 'PM@123',
      });
      await client.query('INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pmId, pkgIds[packages[i]]]);
    }
    console.log('  ✓ Users seeded');

    // ── Engineers (role=Engineer users, 3 per package) ───────────
    for (let i = 0; i < packages.length; i++) {
      for (let j = 1; j <= 3; j++) {
        const loginId = `eng${i + 1}_${j}`;
        const engId = await insertUser(client, {
          name: `Engineer ${i + 1}-${j}`,
          role: 'Engineer',
          loginId,
          email: `${loginId}@concrete.com`,
          hash: hash('Eng@123'),
          plainPw: 'Eng@123',
        });
        await client.query(
          'INSERT INTO user_packages (user_id, package_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [engId, pkgIds[packages[i]]]
        );
      }
    }
    console.log('  ✓ Engineers seeded (3 per package as Engineer users)');

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
      const yyyy = date.getFullYear();
      const mm   = String(date.getMonth() + 1).padStart(2, '0');
      const dd   = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      for (const slot of generateSlotsForDate(dateStr)) {
        await client.query(
          `INSERT INTO slots (slot_date, start_time, end_time, capacity_m3, batching_plant)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slot_date, start_time, batching_plant) DO NOTHING`,
          [slot.slot_date, slot.start_time, slot.end_time, slot.capacity_m3, slot.batching_plant]
        );
      }
    }
    console.log('  ✓ Slots seeded (next 14 days, 5 shifts × 4 plants = 20 slots/day)');

    await client.query('COMMIT');
    console.log('\n✅ Database seeded successfully!');
    console.log('\nDefault credentials (Login ID / Password):');
    console.log('  Admin:         admin  / Admin@123');
    console.log('  VP:            vp     / VP@123');
    console.log('  P&M Head:      pmhead / PMHead@123');
    console.log('  P&M Manager 1: pmm1   / PMM@123  (Camp-1 M3)');
    console.log('  P&M Manager 2: pmm2   / PMM@123  (Camp-2 M3)');
    console.log('  P&M Manager 3: pmm3   / PMM@123  (Camp-3 M1)');
    console.log('  P&M Manager 4: pmm4   / PMM@123  (Camp-1 CP-30)');
    console.log('  Cluster Head:  ch1    / CH@123');
    console.log('  PM 1-13:       pm1    / PM@123');
    console.log('  Engineers:     eng1_1 / Eng@123  (3 per package, eng<pkg>_<1-3>)');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertUser(client, { name, role, loginId, email, hash, plainPw }) {
  const { rows } = await client.query(
    `INSERT INTO users (name, role, login_id, email, password_hash, plain_password)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (login_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, plain_password = EXCLUDED.plain_password
     RETURNING user_id`,
    [name, role, loginId, email || null, hash, plainPw || null]
  );
  return rows[0].user_id;
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
